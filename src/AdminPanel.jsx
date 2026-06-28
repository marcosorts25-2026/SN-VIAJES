import React from 'react'
import SAMPLE from './data/sampleData'
import { mergeTownOptions } from './data/predefinedTowns'
import { loadData as loadRemoteData, saveData as saveRemoteData, isRemoteAvailable, restoreLatestBackup } from './sync'

function normalizeDateList(text) {
  return String(text || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))
}

function dateListToText(list) {
  return (Array.isArray(list) ? list : []).join(', ')
}

function normalizePuebloName(text) {
  // Convierte a Title Case: "del campillo" → "Del Campillo"
  return String(text || '')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()
}

function isOptionalPhoneLikelyValid(value) {
  const text = String(value || '').trim()
  if (!text) return true
  if (!/^[+()\-\s\d]+$/.test(text)) return false
  const digits = text.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

function emptyEmpresaForm() {
  return {
    ID_Empresa: '',
    Nombre_Empresa: '',
    Contacto_Directo: '',
    Celular_Contacto: '',
    Fechas_No_Disponibles_Text: ''
  }
}

function emptyVehiculoForm() {
  return {
    ID_Vehiculo: '',
    Capacidad_Asientos: '',
    Capacidad_Excedente: '',
    Unidades_Disponibles: '',
    Tipo_Vehiculo: '',
    Modelo_Transporte: '',
    Nivel_Confort: 'Estandar',
    Detalle_Confort: '',
    Nombre_Chofer: '',
    Celular_Chofer: ''
  }
}

function emptyRutaForm() {
  return {
    ID_Ruta: '',
    ID_Vehiculo: '',
    Origen_Pueblo: '',
    Destino_Final: '',
    Modalidad_Cobro: 'Viaje Cerrado',
    Precio_Base: '',
    Precio_Por_Pasajero: '',
    RRPP_Cobra: false,
    RRPP_Ganancia_Por_Asiento: '',
    Excedente_Cobra: false,
    Recargo_Excedente: ''
  }
}

function normalizeAdminData(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas : []
  }
}

function dataCountsText(dataset) {
  const normalized = normalizeAdminData(dataset) || { empresas: [], vehiculos: [], rutas: [] }
  return `${normalized.empresas.length} empresas, ${normalized.vehiculos.length} vehiculos, ${normalized.rutas.length} rutas`
}

function confirmTypedAction(message, expectedWord) {
  const typed = window.prompt(`${message}\n\nEscribi ${expectedWord} para confirmar.`)
  return typed === expectedWord
}

function numberInputValue(value) {
  if (value === '' || value === null || value === undefined) return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return ''
  return value
}

function toWholeNumber(value, fallback = 0) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return fallback
  return Number(digits)
}

function splitIdPattern(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(.*?)(\d+)$/)
  if (!match) return { id: text, prefix: text, number: null, width: 3 }
  return {
    id: text,
    prefix: match[1],
    number: Number(match[2]),
    width: match[2].length
  }
}

function buildIdSuggestion(existingIds, currentText, fallbackPrefix) {
  const ids = (Array.isArray(existingIds) ? existingIds : []).map(value => String(value || '').trim()).filter(Boolean)
  const current = String(currentText || '').trim()
  const currentPattern = splitIdPattern(current)
  const parsed = ids.map(splitIdPattern).filter(item => Number.isFinite(item.number))
  const fallbackPattern = parsed.reduce((best, item) => {
    if (!best) return item
    return Number(item.number || 0) > Number(best.number || 0) ? item : best
  }, null)
  const targetPrefix = current
    ? (Number.isFinite(currentPattern.number) ? currentPattern.prefix : current)
    : (fallbackPattern?.prefix || fallbackPrefix)
  const candidates = parsed.filter(item => item.prefix === targetPrefix)
  const latest = candidates.reduce((best, item) => {
    if (!best) return item
    return Number(item.number || 0) > Number(best.number || 0) ? item : best
  }, null) || fallbackPattern
  const nextNumber = Number(latest?.number || 0) + 1
  const width = Math.max(Number(latest?.width || 0), Number(currentPattern.width || 0), 3)
  const prefix = targetPrefix || fallbackPrefix

  return {
    latestId: latest?.id || ids[ids.length - 1] || 'Sin datos',
    suggestedId: `${prefix}${String(nextNumber).padStart(width, '0')}`,
    duplicate: Boolean(current && ids.includes(current))
  }
}

function IdSuggestion({ info, onUse }) {
  if (!info) return null
  return (
    <div className="id-suggestion">
      <span>Ultimo ID: <strong>{info.latestId}</strong></span>
      <span>Siguiente sugerido: <strong>{info.suggestedId}</strong></span>
      <button type="button" onClick={onUse}>Usar</button>
      {info.duplicate && <span className="id-warning">Ese ID ya existe.</span>}
    </div>
  )
}

export default function AdminPanel() {
  const [data, setData] = React.useState(() => SAMPLE)
  const [remoteEnabled, setRemoteEnabled] = React.useState(false)

  const [selectedEmpresaId, setSelectedEmpresaId] = React.useState('')
  const [empresaForm, setEmpresaForm] = React.useState(() => emptyEmpresaForm())
  const [empresaEditForm, setEmpresaEditForm] = React.useState(() => emptyEmpresaForm())

  const [vehiculoForm, setVehiculoForm] = React.useState(() => emptyVehiculoForm())
  const [editingVehiculoId, setEditingVehiculoId] = React.useState('')
  const [editingVehiculoForm, setEditingVehiculoForm] = React.useState(() => emptyVehiculoForm())

  const [rutaForm, setRutaForm] = React.useState(() => emptyRutaForm())
  const [editingRutaId, setEditingRutaId] = React.useState('')
  const [editingRutaForm, setEditingRutaForm] = React.useState(() => emptyRutaForm())

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const remote = await loadRemoteData()
        if (!mounted) return
        if (remote) setData(remote)
        const avail = await isRemoteAvailable()
        if (!mounted) return
        setRemoteEnabled(Boolean(avail))
      } catch (e) {}
    })()
    return () => {
      mounted = false
    }
  }, [])

  React.useEffect(() => {
    if (!Array.isArray(data.empresas) || data.empresas.length === 0) {
      setSelectedEmpresaId('')
      return
    }
    if (!selectedEmpresaId || !data.empresas.find(emp => emp.ID_Empresa === selectedEmpresaId)) {
      setSelectedEmpresaId(data.empresas[0].ID_Empresa)
    }
  }, [data.empresas, selectedEmpresaId])

  const selectedEmpresa = React.useMemo(
    () => data.empresas.find(emp => emp.ID_Empresa === selectedEmpresaId) || null,
    [data.empresas, selectedEmpresaId]
  )

  const vehiculosEmpresa = React.useMemo(
    () => data.vehiculos.filter(v => v.ID_Empresa === selectedEmpresaId),
    [data.vehiculos, selectedEmpresaId]
  )

  const vehiculoIdsEmpresa = React.useMemo(
    () => new Set(vehiculosEmpresa.map(v => v.ID_Vehiculo)),
    [vehiculosEmpresa]
  )

  const rutasEmpresa = React.useMemo(
    () => data.rutas.filter(r => r.ID_Empresa === selectedEmpresaId || vehiculoIdsEmpresa.has(r.ID_Vehiculo)),
    [data.rutas, selectedEmpresaId, vehiculoIdsEmpresa]
  )

  const townOptions = React.useMemo(
    () => mergeTownOptions(data.rutas.flatMap(r => [r.Origen_Pueblo, r.Destino_Final])),
    [data.rutas]
  )

  const empresaIdInfo = React.useMemo(
    () => buildIdSuggestion(data.empresas.map(item => item.ID_Empresa), empresaForm.ID_Empresa, 'EMP-'),
    [data.empresas, empresaForm.ID_Empresa]
  )
  const vehiculoIdInfo = React.useMemo(
    () => buildIdSuggestion(data.vehiculos.map(item => item.ID_Vehiculo), vehiculoForm.ID_Vehiculo, 'VEH-'),
    [data.vehiculos, vehiculoForm.ID_Vehiculo]
  )
  const rutaIdInfo = React.useMemo(
    () => buildIdSuggestion(data.rutas.map(item => item.ID_Ruta), rutaForm.ID_Ruta, 'RUTA-'),
    [data.rutas, rutaForm.ID_Ruta]
  )

  React.useEffect(() => {
    if (!selectedEmpresa) {
      setEmpresaEditForm(emptyEmpresaForm())
      return
    }
    setEmpresaEditForm({
      ID_Empresa: selectedEmpresa.ID_Empresa,
      Nombre_Empresa: selectedEmpresa.Nombre_Empresa || '',
      Contacto_Directo: selectedEmpresa.Contacto_Directo || '',
      Celular_Contacto: selectedEmpresa.Celular_Contacto || '',
      Fechas_No_Disponibles_Text: dateListToText(selectedEmpresa.Fechas_No_Disponibles)
    })
    setVehiculoForm(emptyVehiculoForm())
    setRutaForm(emptyRutaForm())
    setEditingVehiculoId('')
    setEditingRutaId('')
  }, [selectedEmpresa])

  function persist(next) {
    setData(next)
    saveRemoteData(next).catch(() => {
      // Si la sync remota falla, mantenemos los cambios locales sin bloquear la UI.
    })
  }

  function closeEditVehiculoModal() {
    setEditingVehiculoId('')
    setEditingVehiculoForm(emptyVehiculoForm())
  }

  function closeEditRutaModal() {
    setEditingRutaId('')
    setEditingRutaForm(emptyRutaForm())
  }

  function restoreBackupData() {
    if (!confirmTypedAction('Recuperar respaldo reemplaza los datos actuales por el ultimo respaldo local.', 'RECUPERAR')) return
    const restored = restoreLatestBackup()
    if (!restored) {
      alert('No hay respaldo local disponible para recuperar.')
      return
    }
    setData(restored)
    saveRemoteData(restored)
    alert('Respaldo local recuperado con exito.')
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'snt_data.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJSON(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const parsed = normalizeAdminData(JSON.parse(e.target.result))
        if (!parsed) {
          alert('JSON invalido')
          return
        }
        const message = `Importar datos reemplaza la base actual (${dataCountsText(data)}) por el archivo seleccionado (${dataCountsText(parsed)}).`
        if (!confirmTypedAction(message, 'IMPORTAR')) return
        persist(parsed)
        alert('Importado con exito')
      } catch (err) {
        alert('JSON invalido')
      }
    }
    reader.readAsText(file)
  }

  function addEmpresa(e) {
    e.preventDefault()
    const { ID_Empresa, Nombre_Empresa, Contacto_Directo, Celular_Contacto, Fechas_No_Disponibles_Text } = empresaForm
    if (!ID_Empresa || !Nombre_Empresa || !Contacto_Directo || !Celular_Contacto) {
      alert('ID, nombre, contacto y celular son obligatorios')
      return
    }
    if (data.empresas.some(emp => emp.ID_Empresa === ID_Empresa)) {
      alert(`ID_Empresa ya existe. Sugerido: ${empresaIdInfo.suggestedId}`)
      return
    }

    const next = {
      ...data,
      empresas: [
        ...data.empresas,
        {
          ID_Empresa,
          Nombre_Empresa,
          Contacto_Directo,
          Celular_Contacto,
          Fechas_No_Disponibles: normalizeDateList(Fechas_No_Disponibles_Text)
        }
      ]
    }
    persist(next)
    setEmpresaForm(emptyEmpresaForm())
    setSelectedEmpresaId(ID_Empresa)
  }

  function saveEmpresaEdit(e) {
    e.preventDefault()
    if (!selectedEmpresaId) return

    const { Nombre_Empresa, Contacto_Directo, Celular_Contacto, Fechas_No_Disponibles_Text } = empresaEditForm
    if (!Nombre_Empresa || !Contacto_Directo || !Celular_Contacto) {
      alert('Nombre, contacto y celular son obligatorios')
      return
    }

    const next = {
      ...data,
      empresas: data.empresas.map(emp =>
        emp.ID_Empresa === selectedEmpresaId
          ? {
              ...emp,
              Nombre_Empresa,
              Contacto_Directo,
              Celular_Contacto,
              Fechas_No_Disponibles: normalizeDateList(Fechas_No_Disponibles_Text)
            }
          : emp
      )
    }
    persist(next)
    alert('Empresa actualizada')
  }

  function deleteEmpresa(id) {
    if (!id) return
    const ids = new Set(data.vehiculos.filter(v => v.ID_Empresa === id).map(v => v.ID_Vehiculo))
    const vehiclesToDelete = data.vehiculos.filter(v => v.ID_Empresa === id).length
    const routesToDelete = data.rutas.filter(r => r.ID_Empresa === id || ids.has(r.ID_Vehiculo)).length
    if (!confirmTypedAction(`Eliminar esta empresa tambien elimina ${vehiclesToDelete} vehiculos y ${routesToDelete} rutas asociadas.`, 'ELIMINAR')) return

    const next = {
      ...data,
      empresas: data.empresas.filter(emp => emp.ID_Empresa !== id),
      vehiculos: data.vehiculos.filter(v => v.ID_Empresa !== id),
      rutas: data.rutas.filter(r => r.ID_Empresa !== id && !ids.has(r.ID_Vehiculo))
    }
    persist(next)
    if (selectedEmpresaId === id) {
      setSelectedEmpresaId(next.empresas[0]?.ID_Empresa || '')
    }
  }

  function addVehiculo(e) {
    e.preventDefault()
    if (!selectedEmpresaId) {
      alert('Selecciona una empresa primero')
      return
    }

    const {
      ID_Vehiculo,
      Capacidad_Asientos,
      Capacidad_Excedente,
      Unidades_Disponibles,
      Tipo_Vehiculo,
      Modelo_Transporte,
      Nivel_Confort,
      Detalle_Confort,
      Nombre_Chofer,
      Celular_Chofer
    } = vehiculoForm

    if (!ID_Vehiculo || !Tipo_Vehiculo) {
      alert('ID y tipo de transporte son obligatorios')
      return
    }
    if (data.vehiculos.some(v => v.ID_Vehiculo === ID_Vehiculo)) {
      alert(`ID_Vehiculo ya existe. Sugerido: ${vehiculoIdInfo.suggestedId}`)
      return
    }

    const next = {
      ...data,
      vehiculos: [
        ...data.vehiculos,
        {
          ID_Vehiculo,
          ID_Empresa: selectedEmpresaId,
          Capacidad_Asientos: toWholeNumber(Capacidad_Asientos, 0),
          Capacidad_Excedente: toWholeNumber(Capacidad_Excedente, 0),
          Unidades_Disponibles: toWholeNumber(Unidades_Disponibles, 1),
          Tipo_Vehiculo,
          Modelo_Transporte,
          Nivel_Confort,
          Detalle_Confort,
          Nombre_Chofer,
          Celular_Chofer
        }
      ]
    }
    const hasPhoneWarning = !isOptionalPhoneLikelyValid(Celular_Chofer)
    persist(next)
    setVehiculoForm(emptyVehiculoForm())
    if (hasPhoneWarning) {
      alert('Vehiculo agregado. Aviso: el celular del chofer parece incompleto o con formato invalido.')
    }
  }

  function openEditVehiculo(id) {
    const v = data.vehiculos.find(item => item.ID_Vehiculo === id)
    if (!v) return
    setEditingVehiculoId(id)
    setEditingVehiculoForm({
      ID_Vehiculo: v.ID_Vehiculo,
      Capacidad_Asientos: numberInputValue(v.Capacidad_Asientos),
      Capacidad_Excedente: numberInputValue(v.Capacidad_Excedente),
      Unidades_Disponibles: numberInputValue(v.Unidades_Disponibles),
      Tipo_Vehiculo: v.Tipo_Vehiculo || '',
      Modelo_Transporte: v.Modelo_Transporte || '',
      Nivel_Confort: v.Nivel_Confort || 'Estandar',
      Detalle_Confort: v.Detalle_Confort || '',
      Nombre_Chofer: v.Nombre_Chofer || '',
      Celular_Chofer: v.Celular_Chofer || ''
    })
  }

  function saveEditVehiculo(e) {
    e.preventDefault()
    if (!editingVehiculoId) return

    if (!editingVehiculoForm.Tipo_Vehiculo) {
      alert('Tipo de transporte es obligatorio')
      return
    }

    const next = {
      ...data,
      vehiculos: data.vehiculos.map(v =>
        v.ID_Vehiculo === editingVehiculoId
          ? {
              ...v,
              Capacidad_Asientos: toWholeNumber(editingVehiculoForm.Capacidad_Asientos, 0),
              Capacidad_Excedente: toWholeNumber(editingVehiculoForm.Capacidad_Excedente, 0),
              Unidades_Disponibles: toWholeNumber(editingVehiculoForm.Unidades_Disponibles, 1),
              Tipo_Vehiculo: editingVehiculoForm.Tipo_Vehiculo,
              Modelo_Transporte: editingVehiculoForm.Modelo_Transporte,
              Nivel_Confort: editingVehiculoForm.Nivel_Confort,
              Detalle_Confort: editingVehiculoForm.Detalle_Confort,
              Nombre_Chofer: editingVehiculoForm.Nombre_Chofer,
              Celular_Chofer: editingVehiculoForm.Celular_Chofer
            }
          : v
      )
    }
    const hasPhoneWarning = !isOptionalPhoneLikelyValid(editingVehiculoForm.Celular_Chofer)
    closeEditVehiculoModal()
    persist(next)
    if (hasPhoneWarning) {
      alert('Vehiculo actualizado. Aviso: el celular del chofer parece incompleto o con formato invalido.')
    }
  }

  function deleteVehiculo(id) {
    if (!window.confirm('Eliminar vehiculo y sus rutas asociadas?')) return
    const next = {
      ...data,
      vehiculos: data.vehiculos.filter(v => v.ID_Vehiculo !== id),
      rutas: data.rutas.filter(r => r.ID_Vehiculo !== id)
    }
    persist(next)
    setEditingVehiculoId('')
  }

  function addRuta(e) {
    e.preventDefault()
    if (!selectedEmpresaId) {
      alert('Selecciona una empresa primero')
      return
    }

    const {
      ID_Ruta,
      ID_Vehiculo,
      Origen_Pueblo,
      Destino_Final,
      Modalidad_Cobro,
      Precio_Base,
      Precio_Por_Pasajero,
      RRPP_Cobra,
      RRPP_Ganancia_Por_Asiento,
      Excedente_Cobra,
      Recargo_Excedente
    } = rutaForm
    if (!ID_Ruta || !Origen_Pueblo || !Destino_Final || !Precio_Por_Pasajero) {
      alert('Completa todos los campos obligatorios: ID, origen, destino y precio por pasajero')
      return
    }
    if (data.rutas.some(r => r.ID_Ruta === ID_Ruta)) {
      alert(`ID_Ruta ya existe. Sugerido: ${rutaIdInfo.suggestedId}`)
      return
    }

    const next = {
      ...data,
      rutas: [
        ...data.rutas,
        {
          ID_Ruta,
          ID_Empresa: selectedEmpresaId,
          ID_Vehiculo,
          Origen_Pueblo: normalizePuebloName(Origen_Pueblo),
          Destino_Final: normalizePuebloName(Destino_Final),
          Modalidad_Cobro,
          Precio_Base: toWholeNumber(Precio_Base, 0),
          Precio_Por_Pasajero: toWholeNumber(Precio_Por_Pasajero, 0),
          RRPP_Cobra: Boolean(RRPP_Cobra),
          RRPP_Ganancia_Por_Asiento: toWholeNumber(RRPP_Ganancia_Por_Asiento, 0),
          Excedente_Cobra: Boolean(Excedente_Cobra),
          Recargo_Excedente: toWholeNumber(Recargo_Excedente, 0)
        }
      ]
    }
    persist(next)
    setRutaForm(emptyRutaForm())
  }

  function openEditRuta(id) {
    const r = data.rutas.find(item => item.ID_Ruta === id)
    if (!r) return
    setEditingRutaId(id)
    setEditingRutaForm({
      ID_Ruta: r.ID_Ruta,
      ID_Vehiculo: r.ID_Vehiculo || '',
      Origen_Pueblo: r.Origen_Pueblo || '',
      Destino_Final: r.Destino_Final || '',
      Modalidad_Cobro: r.Modalidad_Cobro || 'Viaje Cerrado',
      Precio_Base: numberInputValue(r.Precio_Base),
      Precio_Por_Pasajero: numberInputValue(r.Precio_Por_Pasajero),
      RRPP_Cobra: Boolean(r.RRPP_Cobra),
      RRPP_Ganancia_Por_Asiento: numberInputValue(r.RRPP_Ganancia_Por_Asiento),
      Excedente_Cobra: Boolean(r.Excedente_Cobra),
      Recargo_Excedente: numberInputValue(r.Recargo_Excedente)
    })
  }

  function saveEditRuta(e) {
    e.preventDefault()
    if (!editingRutaId) return

    if (!editingRutaForm.Origen_Pueblo || !editingRutaForm.Destino_Final || !editingRutaForm.Precio_Por_Pasajero) {
      alert('Origen, destino y precio por pasajero son obligatorios')
      return
    }

    const next = {
      ...data,
      rutas: data.rutas.map(r =>
        r.ID_Ruta === editingRutaId
          ? {
              ...r,
              ID_Empresa: selectedEmpresaId,
              ID_Vehiculo: editingRutaForm.ID_Vehiculo || '',
              Origen_Pueblo: normalizePuebloName(editingRutaForm.Origen_Pueblo),
              Destino_Final: normalizePuebloName(editingRutaForm.Destino_Final),
              Modalidad_Cobro: editingRutaForm.Modalidad_Cobro,
              Precio_Base: toWholeNumber(editingRutaForm.Precio_Base, 0),
              Precio_Por_Pasajero: toWholeNumber(editingRutaForm.Precio_Por_Pasajero, 0),
              RRPP_Cobra: Boolean(editingRutaForm.RRPP_Cobra),
              RRPP_Ganancia_Por_Asiento: toWholeNumber(editingRutaForm.RRPP_Ganancia_Por_Asiento, 0),
              Excedente_Cobra: Boolean(editingRutaForm.Excedente_Cobra),
              Recargo_Excedente: toWholeNumber(editingRutaForm.Recargo_Excedente, 0)
            }
          : r
      )
    }
    closeEditRutaModal()
    persist(next)
  }

  function deleteRuta(id) {
    if (!window.confirm('Eliminar ruta?')) return
    const next = {
      ...data,
      rutas: data.rutas.filter(r => r.ID_Ruta !== id)
    }
    persist(next)
    setEditingRutaId('')
  }

  return (
    <div className="admin-panel">
      <datalist id="town-options">
        {townOptions.map(town => <option key={town} value={town} />)}
      </datalist>

      <h2>Administración por empresa</h2>
      <p>
        Carga unificada por empresa: datos de contacto, vehículos con chofer y celular, y rutas con precios.
        Todo queda asociado a la empresa y siempre se puede editar.
      </p>
      <p>Sincronización remota: <strong>{remoteEnabled ? 'Disponible' : 'No disponible'}</strong></p>

      <div className="section-grid">
        <div className="section-card">
          <div className="label">Empresas</div>
          <div className="value">{data.empresas.length}</div>
          <div className="hint">Catálogo base de operación.</div>
        </div>
        <div className="section-card">
          <div className="label">Vehículos</div>
          <div className="value">{data.vehiculos.length}</div>
          <div className="hint">Incluye choferes, capacidad y confort.</div>
        </div>
        <div className="section-card">
          <div className="label">Rutas</div>
          <div className="value">{data.rutas.length}</div>
          <div className="hint">Base para cotizaciones y reservas.</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={restoreBackupData}>Recuperar respaldo</button>
        <button onClick={exportJSON}>Exportar datos</button>
        <label className="import-data-label">
          Importar datos
          <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => importJSON(e.target.files?.[0])} />
        </label>
      </div>

      <section style={{ marginTop: '.75rem', border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
        <h3>Nueva empresa</h3>
        <form onSubmit={addEmpresa} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="id-field">
            <input placeholder="ID_Empresa" value={empresaForm.ID_Empresa} onChange={e => setEmpresaForm({ ...empresaForm, ID_Empresa: e.target.value })} />
            <IdSuggestion info={empresaIdInfo} onUse={() => setEmpresaForm({ ...empresaForm, ID_Empresa: empresaIdInfo.suggestedId })} />
          </div>
          <input placeholder="Nombre_Empresa" value={empresaForm.Nombre_Empresa} onChange={e => setEmpresaForm({ ...empresaForm, Nombre_Empresa: e.target.value })} />
          <input placeholder="Nombre de contacto" value={empresaForm.Contacto_Directo} onChange={e => setEmpresaForm({ ...empresaForm, Contacto_Directo: e.target.value })} />
          <input placeholder="Celular de contacto" value={empresaForm.Celular_Contacto} onChange={e => setEmpresaForm({ ...empresaForm, Celular_Contacto: e.target.value })} />
          <input placeholder="No disponible (AAAA-MM-DD, por coma)" value={empresaForm.Fechas_No_Disponibles_Text} onChange={e => setEmpresaForm({ ...empresaForm, Fechas_No_Disponibles_Text: e.target.value })} />
          <button type="submit">Agregar Empresa</button>
        </form>
      </section>

      <section style={{ marginTop: '.75rem', border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
        <h3>Gestión unificada por empresa</h3>

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            Empresa activa:
            <select value={selectedEmpresaId} onChange={e => setSelectedEmpresaId(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="">Seleccionar empresa</option>
              {data.empresas.map(emp => (
                <option key={emp.ID_Empresa} value={emp.ID_Empresa}>
                  {emp.ID_Empresa} - {emp.Nombre_Empresa}
                </option>
              ))}
            </select>
          </label>
          {selectedEmpresa && <button onClick={() => deleteEmpresa(selectedEmpresa.ID_Empresa)}>Eliminar Empresa Activa</button>}
        </div>

        {selectedEmpresa && (
          <>
            <form onSubmit={saveEmpresaEdit} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '.75rem' }}>
              <input value={empresaEditForm.Nombre_Empresa} onChange={e => setEmpresaEditForm({ ...empresaEditForm, Nombre_Empresa: e.target.value })} placeholder="Nombre_Empresa" />
              <input value={empresaEditForm.Contacto_Directo} onChange={e => setEmpresaEditForm({ ...empresaEditForm, Contacto_Directo: e.target.value })} placeholder="Nombre de contacto" />
              <input value={empresaEditForm.Celular_Contacto} onChange={e => setEmpresaEditForm({ ...empresaEditForm, Celular_Contacto: e.target.value })} placeholder="Celular de contacto" />
              <input value={empresaEditForm.Fechas_No_Disponibles_Text} onChange={e => setEmpresaEditForm({ ...empresaEditForm, Fechas_No_Disponibles_Text: e.target.value })} placeholder="No disponible (AAAA-MM-DD, por coma)" />
              <button type="submit">Guardar Empresa</button>
            </form>

            <section style={{ marginTop: '.75rem' }}>
              <h4>Vehículos y choferes</h4>
              <form onSubmit={addVehiculo} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="id-field">
                  <input placeholder="ID_Vehiculo" value={vehiculoForm.ID_Vehiculo} onChange={e => setVehiculoForm({ ...vehiculoForm, ID_Vehiculo: e.target.value })} />
                  <IdSuggestion info={vehiculoIdInfo} onUse={() => setVehiculoForm({ ...vehiculoForm, ID_Vehiculo: vehiculoIdInfo.suggestedId })} />
                </div>
                <input type="text" inputMode="numeric" placeholder="Asientos" value={numberInputValue(vehiculoForm.Capacidad_Asientos)} onChange={e => setVehiculoForm({ ...vehiculoForm, Capacidad_Asientos: e.target.value })} />
                <input type="text" inputMode="numeric" placeholder="Excedente" value={numberInputValue(vehiculoForm.Capacidad_Excedente)} onChange={e => setVehiculoForm({ ...vehiculoForm, Capacidad_Excedente: e.target.value })} />
                <input type="text" inputMode="numeric" placeholder="Unidades" value={numberInputValue(vehiculoForm.Unidades_Disponibles)} onChange={e => setVehiculoForm({ ...vehiculoForm, Unidades_Disponibles: e.target.value })} />
                <input placeholder="Tipo_Vehiculo" value={vehiculoForm.Tipo_Vehiculo} onChange={e => setVehiculoForm({ ...vehiculoForm, Tipo_Vehiculo: e.target.value })} />
                <input placeholder="Modelo_Transporte" value={vehiculoForm.Modelo_Transporte} onChange={e => setVehiculoForm({ ...vehiculoForm, Modelo_Transporte: e.target.value })} />
                <select value={vehiculoForm.Nivel_Confort} onChange={e => setVehiculoForm({ ...vehiculoForm, Nivel_Confort: e.target.value })}>
                  <option value="Economico">Economico</option>
                  <option value="Estandar">Estandar</option>
                  <option value="Premium">Premium</option>
                  <option value="VIP">VIP</option>
                </select>
                <input placeholder="Detalle_Confort" value={vehiculoForm.Detalle_Confort} onChange={e => setVehiculoForm({ ...vehiculoForm, Detalle_Confort: e.target.value })} />
                <input placeholder="Nombre_Chofer" value={vehiculoForm.Nombre_Chofer} onChange={e => setVehiculoForm({ ...vehiculoForm, Nombre_Chofer: e.target.value })} />
                <input placeholder="Celular_Chofer" value={vehiculoForm.Celular_Chofer} onChange={e => setVehiculoForm({ ...vehiculoForm, Celular_Chofer: e.target.value })} />
                <button type="submit">Agregar vehículo</button>
              </form>

              <ul style={{ marginTop: '.5rem' }}>
                {vehiculosEmpresa.map(v => (
                  <li key={v.ID_Vehiculo} style={{ marginBottom: '.35rem' }}>
                    <strong>{v.ID_Vehiculo}</strong> - {v.Tipo_Vehiculo} {v.Modelo_Transporte ? `(${v.Modelo_Transporte})` : ''} - {v.Capacidad_Asientos} asientos
                    {v.Capacidad_Excedente ? ` +${v.Capacidad_Excedente} extra` : ''} - Unidades: {v.Unidades_Disponibles || 1}
                    {' | '}Chofer: {v.Nombre_Chofer || 's/d'} - Cel: {v.Celular_Chofer || 's/d'}
                    <button type="button" onClick={() => openEditVehiculo(v.ID_Vehiculo)} style={{ marginLeft: 8 }}>Editar</button>
                    <button type="button" onClick={() => deleteVehiculo(v.ID_Vehiculo)} style={{ marginLeft: 4 }}>Eliminar</button>
                  </li>
                ))}
                {vehiculosEmpresa.length === 0 && <li>No hay vehículos cargados para esta empresa.</li>}
              </ul>
            </section>

            <section style={{ marginTop: '.75rem' }}>
              <h4>Rutas y precios</h4>
              <form onSubmit={addRuta} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="id-field">
                  <input placeholder="ID_Ruta" value={rutaForm.ID_Ruta} onChange={e => setRutaForm({ ...rutaForm, ID_Ruta: e.target.value })} />
                  <IdSuggestion info={rutaIdInfo} onUse={() => setRutaForm({ ...rutaForm, ID_Ruta: rutaIdInfo.suggestedId })} />
                </div>
                <select value={rutaForm.ID_Vehiculo} onChange={e => setRutaForm({ ...rutaForm, ID_Vehiculo: e.target.value })}>
                  <option value="">Ruta general de empresa</option>
                  {vehiculosEmpresa.map(vehiculo => (
                    <option key={vehiculo.ID_Vehiculo} value={vehiculo.ID_Vehiculo}>
                      {vehiculo.ID_Vehiculo} - {vehiculo.Tipo_Vehiculo}
                    </option>
                  ))}
                </select>
                <input list="town-options" placeholder="Origen_Pueblo" value={rutaForm.Origen_Pueblo} onChange={e => setRutaForm({ ...rutaForm, Origen_Pueblo: e.target.value })} />
                <input list="town-options" placeholder="Destino_Final" value={rutaForm.Destino_Final} onChange={e => setRutaForm({ ...rutaForm, Destino_Final: e.target.value })} />
                <input type="text" inputMode="numeric" placeholder="Precio por Pasajero ($)" value={numberInputValue(rutaForm.Precio_Por_Pasajero)} onChange={e => setRutaForm({ ...rutaForm, Precio_Por_Pasajero: e.target.value })} style={{ fontWeight: 'bold' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={rutaForm.RRPP_Cobra} onChange={e => setRutaForm({ ...rutaForm, RRPP_Cobra: e.target.checked })} />
                  Cobra RRPP
                </label>
                <input type="text" inputMode="numeric" placeholder="Ganancia RRPP x asiento" value={numberInputValue(rutaForm.RRPP_Ganancia_Por_Asiento)} onChange={e => setRutaForm({ ...rutaForm, RRPP_Ganancia_Por_Asiento: e.target.value })} />
                <select value={rutaForm.Modalidad_Cobro} onChange={e => setRutaForm({ ...rutaForm, Modalidad_Cobro: e.target.value })}>
                  <option>Viaje Cerrado</option>
                  <option>Por Pasajero</option>
                </select>
                <input type="text" inputMode="numeric" placeholder="Precio_Base" value={numberInputValue(rutaForm.Precio_Base)} onChange={e => setRutaForm({ ...rutaForm, Precio_Base: e.target.value })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={rutaForm.Excedente_Cobra} onChange={e => setRutaForm({ ...rutaForm, Excedente_Cobra: e.target.checked })} />
                  Cobrar excedente
                </label>
                <input type="text" inputMode="numeric" placeholder="Recargo_Excedente" value={numberInputValue(rutaForm.Recargo_Excedente)} onChange={e => setRutaForm({ ...rutaForm, Recargo_Excedente: e.target.value })} />
                <button type="submit">Agregar ruta</button>
              </form>

              <ul style={{ marginTop: '.5rem' }}>
                {rutasEmpresa.map(r => (
                  <li key={r.ID_Ruta} style={{ marginBottom: '.35rem' }}>
                    <strong>{r.ID_Ruta}</strong> - {r.Origen_Pueblo} a {r.Destino_Final}
                    {' - '}${Number(r.Precio_Por_Pasajero || 0).toLocaleString('es-AR')}/pasajero
                    {r.RRPP_Cobra ? ` + RRPP $${Number(r.RRPP_Ganancia_Por_Asiento || 0).toLocaleString('es-AR')}/asiento` : ''}
                    {' - '}{r.Modalidad_Cobro}
                    {r.Excedente_Cobra ? ` (Excedente: $${Number(r.Recargo_Excedente || 0).toLocaleString('es-AR')})` : ''}
                    <button type="button" onClick={() => openEditRuta(r.ID_Ruta)} style={{ marginLeft: 8 }}>Editar</button>
                    <button type="button" onClick={() => deleteRuta(r.ID_Ruta)} style={{ marginLeft: 4 }}>Eliminar</button>
                  </li>
                ))}
                {rutasEmpresa.length === 0 && <li>No hay rutas cargadas para esta empresa.</li>}
              </ul>
            </section>
          </>
        )}
      </section>

      {editingVehiculoId && (
        <div className="modal">
          <form key={editingVehiculoId} onSubmit={saveEditVehiculo} className="modal-content">
            <h3>Editar vehículo {editingVehiculoId}</h3>
            <input type="text" inputMode="numeric" value={numberInputValue(editingVehiculoForm.Capacidad_Asientos)} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Capacidad_Asientos: e.target.value })} placeholder="Capacidad_Asientos" />
            <input type="text" inputMode="numeric" value={numberInputValue(editingVehiculoForm.Capacidad_Excedente)} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Capacidad_Excedente: e.target.value })} placeholder="Capacidad_Excedente" />
            <input type="text" inputMode="numeric" value={numberInputValue(editingVehiculoForm.Unidades_Disponibles)} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Unidades_Disponibles: e.target.value })} placeholder="Unidades_Disponibles" />
            <input value={editingVehiculoForm.Tipo_Vehiculo} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Tipo_Vehiculo: e.target.value })} placeholder="Tipo_Vehiculo" />
            <input value={editingVehiculoForm.Modelo_Transporte} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Modelo_Transporte: e.target.value })} placeholder="Modelo_Transporte" />
            <select value={editingVehiculoForm.Nivel_Confort} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Nivel_Confort: e.target.value })}>
              <option value="Economico">Economico</option>
              <option value="Estandar">Estandar</option>
              <option value="Premium">Premium</option>
              <option value="VIP">VIP</option>
            </select>
            <input value={editingVehiculoForm.Detalle_Confort} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Detalle_Confort: e.target.value })} placeholder="Detalle_Confort" />
            <input value={editingVehiculoForm.Nombre_Chofer} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Nombre_Chofer: e.target.value })} placeholder="Nombre_Chofer" />
            <input value={editingVehiculoForm.Celular_Chofer} onChange={e => setEditingVehiculoForm({ ...editingVehiculoForm, Celular_Chofer: e.target.value })} placeholder="Celular_Chofer" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit">Guardar</button>
              <button type="button" onClick={closeEditVehiculoModal}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {editingRutaId && (
        <div className="modal">
          <form key={editingRutaId} onSubmit={saveEditRuta} className="modal-content">
            <h3>Editar ruta {editingRutaId}</h3>
            <select value={editingRutaForm.ID_Vehiculo} onChange={e => setEditingRutaForm({ ...editingRutaForm, ID_Vehiculo: e.target.value })}>
              <option value="">Ruta general de empresa</option>
              {vehiculosEmpresa.map(vehiculo => (
                <option key={vehiculo.ID_Vehiculo} value={vehiculo.ID_Vehiculo}>
                  {vehiculo.ID_Vehiculo} - {vehiculo.Tipo_Vehiculo}
                </option>
              ))}
            </select>
            <input list="town-options" value={editingRutaForm.Origen_Pueblo} onChange={e => setEditingRutaForm({ ...editingRutaForm, Origen_Pueblo: e.target.value })} placeholder="Origen_Pueblo" />
            <input list="town-options" value={editingRutaForm.Destino_Final} onChange={e => setEditingRutaForm({ ...editingRutaForm, Destino_Final: e.target.value })} placeholder="Destino_Final" />
            <input type="text" inputMode="numeric" value={numberInputValue(editingRutaForm.Precio_Por_Pasajero)} onChange={e => setEditingRutaForm({ ...editingRutaForm, Precio_Por_Pasajero: e.target.value })} placeholder="Precio por Pasajero ($)" style={{ fontWeight: 'bold' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={editingRutaForm.RRPP_Cobra} onChange={e => setEditingRutaForm({ ...editingRutaForm, RRPP_Cobra: e.target.checked })} />
              Cobra RRPP
            </label>
            <input type="text" inputMode="numeric" value={numberInputValue(editingRutaForm.RRPP_Ganancia_Por_Asiento)} onChange={e => setEditingRutaForm({ ...editingRutaForm, RRPP_Ganancia_Por_Asiento: e.target.value })} placeholder="Ganancia RRPP x asiento" />
            <select value={editingRutaForm.Modalidad_Cobro} onChange={e => setEditingRutaForm({ ...editingRutaForm, Modalidad_Cobro: e.target.value })}>
              <option>Viaje Cerrado</option>
              <option>Por Pasajero</option>
            </select>
            <input type="text" inputMode="numeric" value={numberInputValue(editingRutaForm.Precio_Base)} onChange={e => setEditingRutaForm({ ...editingRutaForm, Precio_Base: e.target.value })} placeholder="Precio_Base" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={editingRutaForm.Excedente_Cobra} onChange={e => setEditingRutaForm({ ...editingRutaForm, Excedente_Cobra: e.target.checked })} />
              Cobrar excedente
            </label>
            <input type="text" inputMode="numeric" value={numberInputValue(editingRutaForm.Recargo_Excedente)} onChange={e => setEditingRutaForm({ ...editingRutaForm, Recargo_Excedente: e.target.value })} placeholder="Recargo_Excedente" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit">Guardar</button>
              <button type="button" onClick={closeEditRutaModal}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
