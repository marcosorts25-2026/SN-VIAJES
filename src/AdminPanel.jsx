import React from 'react'
import SAMPLE from './data/sampleData'
import { loadData as loadRemoteData, saveData as saveRemoteData, isRemoteAvailable } from './sync'

export default function AdminPanel() {
  const [data, setData] = React.useState(() => SAMPLE)
  const [remoteEnabled, setRemoteEnabled] = React.useState(false)

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
    return () => { mounted = false }
  }, [])
  const [empresaForm, setEmpresaForm] = React.useState({ ID_Empresa:'', Nombre_Empresa:'', Contacto_Directo:'' })
  const [vehiculoForm, setVehiculoForm] = React.useState({ ID_Vehiculo:'', ID_Empresa:'', Capacidad_Asientos:4, Capacidad_Excedente:0, Unidades_Disponibles:1, Tipo_Vehiculo:'' })
  const [rutaForm, setRutaForm] = React.useState({ ID_Ruta:'', ID_Vehiculo:'', Origen_Pueblo:'', Modalidad_Cobro:'Viaje Cerrado', Precio_Base:0, Excedente_Cobra: false, Recargo_Excedente: 0 })

  // UI state for edit/clone modals (replaces prompt usage)
  const [editingEmpresa, setEditingEmpresa] = React.useState(null)
  const [editingEmpresaForm, setEditingEmpresaForm] = React.useState({ Nombre_Empresa:'', Contacto_Directo:'' })

  const [editingVehiculo, setEditingVehiculo] = React.useState(null)
  const [editingVehiculoForm, setEditingVehiculoForm] = React.useState({ Capacidad_Asientos:4, Capacidad_Excedente:0, Unidades_Disponibles:1, Tipo_Vehiculo:'' })

  const [cloningVehiculo, setCloningVehiculo] = React.useState(null)
  const [cloningVehiculoForm, setCloningVehiculoForm] = React.useState({ ID_Vehiculo:'', Capacidad_Asientos:4, Capacidad_Excedente:0, Unidades_Disponibles:1, Tipo_Vehiculo:'' })

  const [editingRuta, setEditingRuta] = React.useState(null)
  const [editingRutaForm, setEditingRutaForm] = React.useState({ ID_Ruta:'', Origen_Pueblo:'', Modalidad_Cobro:'Viaje Cerrado', Precio_Base:0, Excedente_Cobra:false, Recargo_Excedente:0 })

  const [confirmDelete, setConfirmDelete] = React.useState({ show:false, type:'', id:'' })

  function resetSample() {
    setData(SAMPLE)
    saveRemoteData(SAMPLE)
    alert('Datos restaurados desde ejemplo')
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'snt_data.json'; a.click(); URL.revokeObjectURL(url)
  }

  function importJSON(file) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result)
        setData(parsed)
        saveRemoteData(parsed)
        alert('Importado con éxito')
      } catch (err) {
        alert('JSON inválido')
      }
    }
    reader.readAsText(file)
  }

  // --- Modal-based edit/save handlers (replacing prompts) ---
  function openEditEmpresa(id){
    const emp = data.empresas.find(x=>x.ID_Empresa===id)
    if(!emp) return
    setEditingEmpresa(id)
    setEditingEmpresaForm({ Nombre_Empresa: emp.Nombre_Empresa || '', Contacto_Directo: emp.Contacto_Directo || '' })
  }

  function saveEditEmpresa(e){
    e && e.preventDefault()
    if(!editingEmpresa) return
    const next = { ...data, empresas: data.empresas.map(x=> x.ID_Empresa===editingEmpresa ? { ...x, Nombre_Empresa: editingEmpresaForm.Nombre_Empresa, Contacto_Directo: editingEmpresaForm.Contacto_Directo } : x) }
    setData(next); saveRemoteData(next); setEditingEmpresa(null)
  }

  function openEditVehiculo(id){
    const v = data.vehiculos.find(x=>x.ID_Vehiculo===id)
    if(!v) return
    setEditingVehiculo(id)
    setEditingVehiculoForm({ Capacidad_Asientos: v.Capacidad_Asientos||4, Capacidad_Excedente: v.Capacidad_Excedente||0, Unidades_Disponibles: v.Unidades_Disponibles||1, Tipo_Vehiculo: v.Tipo_Vehiculo||'' })
  }

  function saveEditVehiculo(e){
    e && e.preventDefault()
    if(!editingVehiculo) return
    const next = { ...data, vehiculos: data.vehiculos.map(x=> x.ID_Vehiculo===editingVehiculo ? { ...x, Capacidad_Asientos: Number(editingVehiculoForm.Capacidad_Asientos), Capacidad_Excedente: Number(editingVehiculoForm.Capacidad_Excedente||0), Unidades_Disponibles: Number(editingVehiculoForm.Unidades_Disponibles||1), Tipo_Vehiculo: editingVehiculoForm.Tipo_Vehiculo } : x) }
    setData(next); saveRemoteData(next); setEditingVehiculo(null)
  }

  function openCloneVehiculo(id){
    const v = data.vehiculos.find(x=> x.ID_Vehiculo===id)
    if(!v) return
    setCloningVehiculo(id)
    setCloningVehiculoForm({ ID_Vehiculo: id + '-CL', Capacidad_Asientos: v.Capacidad_Asientos||4, Capacidad_Excedente: v.Capacidad_Excedente||0, Unidades_Disponibles: v.Unidades_Disponibles||1, Tipo_Vehiculo: v.Tipo_Vehiculo||'', ID_Empresa: v.ID_Empresa })
  }

  function saveCloneVehiculo(e){
    e && e.preventDefault()
    const { ID_Vehiculo, Capacidad_Asientos, Capacidad_Excedente, Unidades_Disponibles, Tipo_Vehiculo, ID_Empresa } = cloningVehiculoForm
    if (!ID_Vehiculo || !ID_Empresa) return alert('ID y Empresa obligatorios')
    if (data.vehiculos.find(x=>x.ID_Vehiculo===ID_Vehiculo)) return alert('ID_Vehiculo ya existe')
    const nextV = { ID_Vehiculo, ID_Empresa: cloningVehiculoForm.ID_Empresa || ID_Empresa, Capacidad_Asientos: Number(Capacidad_Asientos), Capacidad_Excedente: Number(Capacidad_Excedente||0), Unidades_Disponibles: Number(Unidades_Disponibles||1), Tipo_Vehiculo }
    const next = { ...data, vehiculos: [...data.vehiculos, nextV] }
    setData(next); saveRemoteData(next); setCloningVehiculo(null)
  }

  function openEditRuta(id){
    const r = data.rutas.find(x=>x.ID_Ruta===id)
    if(!r) return
    setEditingRuta(id)
    setEditingRutaForm({ ID_Ruta: r.ID_Ruta, Origen_Pueblo: r.Origen_Pueblo, Modalidad_Cobro: r.Modalidad_Cobro||'Viaje Cerrado', Precio_Base: r.Precio_Base||0, Excedente_Cobra: Boolean(r.Excedente_Cobra), Recargo_Excedente: r.Recargo_Excedente||0 })
  }

  function saveEditRuta(e){
    e && e.preventDefault()
    if(!editingRuta) return
    const next = { ...data, rutas: data.rutas.map(x=> x.ID_Ruta===editingRuta ? { ...x, Origen_Pueblo: editingRutaForm.Origen_Pueblo, Modalidad_Cobro: editingRutaForm.Modalidad_Cobro, Precio_Base: Number(editingRutaForm.Precio_Base), Excedente_Cobra: Boolean(editingRutaForm.Excedente_Cobra), Recargo_Excedente: Number(editingRutaForm.Recargo_Excedente||0) } : x) }
    setData(next); saveRemoteData(next); setEditingRuta(null)
  }

  function showDeleteConfirm(type, id){ setConfirmDelete({ show:true, type, id }) }
  function performDelete(){
    const { type, id } = confirmDelete
    if(!type) return setConfirmDelete({ show:false, type:'', id:'' })
    let next
    if (type === 'empresas') next = { ...data, empresas: data.empresas.filter(x=> x.ID_Empresa !== id) }
    else if (type === 'vehiculos') next = { ...data, vehiculos: data.vehiculos.filter(x=> x.ID_Vehiculo !== id) }
    else next = { ...data, rutas: data.rutas.filter(x=> x.ID_Ruta !== id) }
    setData(next); saveRemoteData(next); setConfirmDelete({ show:false, type:'', id:'' })
  }


  function addEmpresa(e){
    e.preventDefault()
    const { ID_Empresa, Nombre_Empresa, Contacto_Directo } = empresaForm
    if (!ID_Empresa || !Nombre_Empresa) return alert('ID y Nombre obligatorios')
    if (data.empresas.find(x=>x.ID_Empresa===ID_Empresa)) return alert('ID_Empresa ya existe')
    const next = { ...data, empresas: [...data.empresas, { ID_Empresa, Nombre_Empresa, Contacto_Directo }] }
    setData(next); saveRemoteData(next); setEmpresaForm({ ID_Empresa:'', Nombre_Empresa:'', Contacto_Directo:'' })
  }

  function addVehiculo(e){
    e.preventDefault()
    const { ID_Vehiculo, ID_Empresa, Capacidad_Asientos, Capacidad_Excedente, Unidades_Disponibles, Tipo_Vehiculo } = vehiculoForm
    if (!ID_Vehiculo || !ID_Empresa || !Tipo_Vehiculo) return alert('Completa los campos obligatorios')
    if (!data.empresas.find(x=>x.ID_Empresa===ID_Empresa)) return alert('ID_Empresa no existe')
    if (data.vehiculos.find(x=>x.ID_Vehiculo===ID_Vehiculo)) return alert('ID_Vehiculo ya existe')
    const next = { ...data, vehiculos: [...data.vehiculos, { ID_Vehiculo, ID_Empresa, Capacidad_Asientos: Number(Capacidad_Asientos), Capacidad_Excedente: Number(Capacidad_Excedente), Unidades_Disponibles: Number(Unidades_Disponibles||1), Tipo_Vehiculo }] }
    setData(next); saveRemoteData(next); setVehiculoForm({ ID_Vehiculo:'', ID_Empresa:'', Capacidad_Asientos:4, Capacidad_Excedente:0, Unidades_Disponibles:1, Tipo_Vehiculo:'' })
  }

  function addRuta(e){
    e.preventDefault()
    const { ID_Ruta, ID_Vehiculo, Origen_Pueblo, Modalidad_Cobro, Precio_Base, Excedente_Cobra, Recargo_Excedente } = rutaForm
    if (!ID_Ruta || !ID_Vehiculo || !Origen_Pueblo) return alert('Completa los campos obligatorios')
    if (!data.vehiculos.find(x=>x.ID_Vehiculo===ID_Vehiculo)) return alert('ID_Vehiculo no existe')
    if (data.rutas.find(x=>x.ID_Ruta===ID_Ruta)) return alert('ID_Ruta ya existe')
    const next = { ...data, rutas: [...data.rutas, { ID_Ruta, ID_Vehiculo, Origen_Pueblo, Destino_Final: 'Vicuña Mackenna', Modalidad_Cobro, Precio_Base: Number(Precio_Base), Excedente_Cobra: Boolean(Excedente_Cobra), Recargo_Excedente: Number(Recargo_Excedente) }] }
    setData(next); saveRemoteData(next); setRutaForm({ ID_Ruta:'', ID_Vehiculo:'', Origen_Pueblo:'', Modalidad_Cobro:'Viaje Cerrado', Precio_Base:0, Excedente_Cobra:false, Recargo_Excedente:0 })
  }

  function editRuta(id){
    const r = data.rutas.find(x=>x.ID_Ruta===id)
    if (!r) return
    const nuevoPrecio = prompt('Nuevo Precio_Base', String(r.Precio_Base))
    if (nuevoPrecio === null) return
    const nuevoEx = confirm('¿Cobrar excedente en esta ruta? (Aceptar = Sí, Cancelar = No)')
    const nuevoRec = prompt('Recargo por cada pasajero excedente (0 si no aplica)', String(r.Recargo_Excedente || 0))
    const next = { ...data, rutas: data.rutas.map(x => x.ID_Ruta===id ? { ...x, Precio_Base: Number(nuevoPrecio), Excedente_Cobra: Boolean(nuevoEx), Recargo_Excedente: Number(nuevoRec||0) } : x) }
    setData(next); saveData(next); alert('Ruta actualizada')
  }

  function editRutaPrecio(id){
    const r = data.rutas.find(x=>x.ID_Ruta===id)
    if (!r) return
    const nuevo = prompt('Nuevo Precio_Base', String(r.Precio_Base))
    if (nuevo === null) return
    const next = { ...data, rutas: data.rutas.map(x => x.ID_Ruta===id ? { ...x, Precio_Base: Number(nuevo) } : x) }
    setData(next); saveData(next); alert('Precio actualizado')
  }

  function deleteItem(type, id){
    if (!confirm('Confirmar eliminación')) return
    const next = { ...data, [type]: data[type].filter(x=> x.ID_Empresa ? x.ID_Empresa!==id : (x.ID_Vehiculo ? x.ID_Vehiculo!==id : x.ID_Ruta!==id)) }
    setData(next); saveData(next)
  }

  function cloneVehicle(sourceId){
    const v = data.vehiculos.find(x=> x.ID_Vehiculo===sourceId)
    if (!v) return alert('Vehículo origen no encontrado')
    // open clone modal instead
    openCloneVehiculo(sourceId)
  }

  return (
    <div className="admin-panel">
      <h2>Panel Administrativo (datos locales)</h2>
            <p>Los cambios se guardan en <strong>localStorage</strong> y, si está configurado, se sincronizan con Firebase. También puedes exportar/importar JSON o editar <code>public/data.json</code>.</p>

      <div style={{display:'flex', gap:'.5rem', marginTop:'.5rem', flexWrap:'wrap'}}>
        <button onClick={resetSample}>Restaurar datos de ejemplo</button>
        <button onClick={exportJSON}>Exportar JSON</button>
        <label style={{background:'#eee', padding:'.4rem', borderRadius:6, cursor:'pointer'}}>Importar JSON<input type="file" accept="application/json" style={{display:'none'}} onChange={e => importJSON(e.target.files[0])} /></label>
      </div>

      <section style={{marginTop:'.75rem'}}>
        <h3>Agregar Empresa</h3>
        <form onSubmit={addEmpresa} style={{display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center'}}>
          <input placeholder="ID_Empresa (EMP-10)" value={empresaForm.ID_Empresa} onChange={e=>setEmpresaForm({...empresaForm, ID_Empresa:e.target.value})} />
          <input placeholder="Nombre_Empresa" value={empresaForm.Nombre_Empresa} onChange={e=>setEmpresaForm({...empresaForm, Nombre_Empresa:e.target.value})} />
          <input placeholder="Contacto_Directo" value={empresaForm.Contacto_Directo} onChange={e=>setEmpresaForm({...empresaForm, Contacto_Directo:e.target.value})} />
          <button type="submit">Agregar Empresa</button>
        </form>
      </section>

      <section style={{marginTop:'.75rem'}}>
        <h3>Agregar Vehículo</h3>
        <form onSubmit={addVehiculo} style={{display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center'}}>
          <input placeholder="ID_Vehiculo (V-010)" value={vehiculoForm.ID_Vehiculo} onChange={e=>setVehiculoForm({...vehiculoForm, ID_Vehiculo:e.target.value})} />
          <select value={vehiculoForm.ID_Empresa} onChange={e=>setVehiculoForm({...vehiculoForm, ID_Empresa:e.target.value})}>
            <option value="">Seleccionar empresa</option>
            {data.empresas.map(emp => <option key={emp.ID_Empresa} value={emp.ID_Empresa}>{emp.ID_Empresa} — {emp.Nombre_Empresa}</option>)}
          </select>
          <input type="number" min="1" placeholder="Asientos (ej. 15)" value={vehiculoForm.Capacidad_Asientos} onChange={e=>setVehiculoForm({...vehiculoForm, Capacidad_Asientos:e.target.value})} />
          <input type="number" min="0" placeholder="Excedente (ej. 2)" value={vehiculoForm.Capacidad_Excedente} onChange={e=>setVehiculoForm({...vehiculoForm, Capacidad_Excedente:e.target.value})} />
          <input type="number" min="1" placeholder="Unidades disponibles" value={vehiculoForm.Unidades_Disponibles} onChange={e=>setVehiculoForm({...vehiculoForm, Unidades_Disponibles:e.target.value})} />
          <input placeholder="Tipo_Vehiculo" value={vehiculoForm.Tipo_Vehiculo} onChange={e=>setVehiculoForm({...vehiculoForm, Tipo_Vehiculo:e.target.value})} />
          <button type="submit">Agregar Vehículo</button>
        </form>
      </section>

      <section style={{marginTop:'.75rem'}}>
        <h3>Agregar Ruta</h3>
        <form onSubmit={addRuta} style={{display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center'}}>
          <input placeholder="ID_Ruta (RT-200)" value={rutaForm.ID_Ruta} onChange={e=>setRutaForm({...rutaForm, ID_Ruta:e.target.value})} />
          <select value={rutaForm.ID_Vehiculo} onChange={e=>setRutaForm({...rutaForm, ID_Vehiculo:e.target.value})}>
            <option value="">Seleccionar vehículo</option>
            {data.vehiculos.map(v => <option key={v.ID_Vehiculo} value={v.ID_Vehiculo}>{v.ID_Vehiculo} — {v.Tipo_Vehiculo}</option>)}
          </select>
          <input placeholder="Origen_Pueblo" value={rutaForm.Origen_Pueblo} onChange={e=>setRutaForm({...rutaForm, Origen_Pueblo:e.target.value})} />
          <select value={rutaForm.Modalidad_Cobro} onChange={e=>setRutaForm({...rutaForm, Modalidad_Cobro:e.target.value})}>
            <option>Viaje Cerrado</option>
            <option>Por Pasajero</option>
          </select>
          <input type="number" placeholder="Precio_Base" value={rutaForm.Precio_Base} onChange={e=>setRutaForm({...rutaForm, Precio_Base:e.target.value})} />
          <label style={{display:'flex', alignItems:'center', gap:6}}><input type="checkbox" checked={rutaForm.Excedente_Cobra} onChange={e=>setRutaForm({...rutaForm, Excedente_Cobra:e.target.checked})} /> Cobrar excedente</label>
          <input type="number" placeholder="Recargo_Excedente" value={rutaForm.Recargo_Excedente} onChange={e=>setRutaForm({...rutaForm, Recargo_Excedente:e.target.value})} />
          <button type="submit">Agregar Ruta</button>
        </form>
      </section>

      <section style={{marginTop:'.75rem'}}>
        <h3>Listados</h3>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.5rem'}}>
          <div>
            <h4>Empresas</h4>
            <ul>
              {data.empresas.map(emp => (
                <li key={emp.ID_Empresa}>{emp.ID_Empresa} — {emp.Nombre_Empresa} <button onClick={()=>openEditEmpresa(emp.ID_Empresa)}>Editar</button> <button onClick={()=>showDeleteConfirm('empresas', emp.ID_Empresa)}>Eliminar</button></li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Vehículos</h4>
            <ul>
              {data.vehiculos.map(v => {
                const seats = v.Capacidad_Asientos ?? v.Capacidad_Maxima ?? 0
                const extra = v.Capacidad_Excedente ?? 0
                return (
                  <li key={v.ID_Vehiculo}>{v.ID_Vehiculo} — {v.Tipo_Vehiculo} ({seats} asientos{extra ? ` +${extra} extra` : ''}) — Unidades: {v.Unidades_Disponibles ?? 1} <button onClick={()=>openEditVehiculo(v.ID_Vehiculo)}>Editar</button> <button onClick={()=>openCloneVehiculo(v.ID_Vehiculo)}>Clonar</button> <button onClick={()=>showDeleteConfirm('vehiculos', v.ID_Vehiculo)}>Eliminar</button></li>
                )
              })}
            </ul>
          </div>

          <div>
            <h4>Rutas</h4>
            <ul>
              {data.rutas.map(r => (
                <li key={r.ID_Ruta}>{r.ID_Ruta} — {r.Origen_Pueblo} — {r.Modalidad_Cobro} — {r.Precio_Base} <button onClick={()=>openEditRuta(r.ID_Ruta)}>Editar</button> <button onClick={()=>showDeleteConfirm('rutas', r.ID_Ruta)}>Eliminar</button></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* EditEmpresa modal */}
      {editingEmpresa && (
        <div className="modal">
          <form onSubmit={saveEditEmpresa} className="modal-content">
            <h3>Editar Empresa {editingEmpresa}</h3>
            <input value={editingEmpresaForm.Nombre_Empresa} onChange={e=>setEditingEmpresaForm({...editingEmpresaForm, Nombre_Empresa: e.target.value})} placeholder="Nombre_Empresa" />
            <input value={editingEmpresaForm.Contacto_Directo} onChange={e=>setEditingEmpresaForm({...editingEmpresaForm, Contacto_Directo: e.target.value})} placeholder="Contacto_Directo" />
            <div style={{display:'flex', gap:8}}><button type="submit">Guardar</button><button type="button" onClick={()=>setEditingEmpresa(null)}>Cancelar</button></div>
          </form>
        </div>
      )}

      {/* EditVehiculo modal */}
      {editingVehiculo && (
        <div className="modal">
          <form onSubmit={saveEditVehiculo} className="modal-content">
            <h3>Editar Vehículo {editingVehiculo}</h3>
            <input type="number" value={editingVehiculoForm.Capacidad_Asientos} onChange={e=>setEditingVehiculoForm({...editingVehiculoForm, Capacidad_Asientos: e.target.value})} placeholder="Capacidad_Asientos" />
            <input type="number" value={editingVehiculoForm.Capacidad_Excedente} onChange={e=>setEditingVehiculoForm({...editingVehiculoForm, Capacidad_Excedente: e.target.value})} placeholder="Capacidad_Excedente" />
            <input type="number" value={editingVehiculoForm.Unidades_Disponibles} onChange={e=>setEditingVehiculoForm({...editingVehiculoForm, Unidades_Disponibles: e.target.value})} placeholder="Unidades_Disponibles" />
            <input value={editingVehiculoForm.Tipo_Vehiculo} onChange={e=>setEditingVehiculoForm({...editingVehiculoForm, Tipo_Vehiculo: e.target.value})} placeholder="Tipo_Vehiculo" />
            <div style={{display:'flex', gap:8}}><button type="submit">Guardar</button><button type="button" onClick={()=>setEditingVehiculo(null)}>Cancelar</button></div>
          </form>
        </div>
      )}

      {/* CloneVehiculo modal */}
      {cloningVehiculo && (
        <div className="modal">
          <form onSubmit={saveCloneVehiculo} className="modal-content">
            <h3>Clonar Vehículo {cloningVehiculo}</h3>
            <input value={cloningVehiculoForm.ID_Vehiculo} onChange={e=>setCloningVehiculoForm({...cloningVehiculoForm, ID_Vehiculo: e.target.value})} placeholder="Nuevo ID_Vehiculo" />
            <select value={cloningVehiculoForm.ID_Empresa || ''} onChange={e=>setCloningVehiculoForm({...cloningVehiculoForm, ID_Empresa: e.target.value})}>
              <option value="">Seleccionar empresa</option>
              {data.empresas.map(emp => <option key={emp.ID_Empresa} value={emp.ID_Empresa}>{emp.ID_Empresa} — {emp.Nombre_Empresa}</option>)}
            </select>
            <input type="number" value={cloningVehiculoForm.Capacidad_Asientos} onChange={e=>setCloningVehiculoForm({...cloningVehiculoForm, Capacidad_Asientos: e.target.value})} placeholder="Asientos" />
            <input type="number" value={cloningVehiculoForm.Capacidad_Excedente} onChange={e=>setCloningVehiculoForm({...cloningVehiculoForm, Capacidad_Excedente: e.target.value})} placeholder="Excedente" />
            <input type="number" value={cloningVehiculoForm.Unidades_Disponibles} onChange={e=>setCloningVehiculoForm({...cloningVehiculoForm, Unidades_Disponibles: e.target.value})} placeholder="Unidades" />
            <input value={cloningVehiculoForm.Tipo_Vehiculo} onChange={e=>setCloningVehiculoForm({...cloningVehiculoForm, Tipo_Vehiculo: e.target.value})} placeholder="Tipo" />
            <div style={{display:'flex', gap:8}}><button type="submit">Clonar</button><button type="button" onClick={()=>setCloningVehiculo(null)}>Cancelar</button></div>
          </form>
        </div>
      )}

      {/* EditRuta modal */}
      {editingRuta && (
        <div className="modal">
          <form onSubmit={saveEditRuta} className="modal-content">
            <h3>Editar Ruta {editingRuta}</h3>
            <input value={editingRutaForm.Origen_Pueblo} onChange={e=>setEditingRutaForm({...editingRutaForm, Origen_Pueblo: e.target.value})} placeholder="Origen_Pueblo" />
            <select value={editingRutaForm.Modalidad_Cobro} onChange={e=>setEditingRutaForm({...editingRutaForm, Modalidad_Cobro: e.target.value})}><option>Viaje Cerrado</option><option>Por Pasajero</option></select>
            <input type="number" value={editingRutaForm.Precio_Base} onChange={e=>setEditingRutaForm({...editingRutaForm, Precio_Base: e.target.value})} placeholder="Precio_Base" />
            <label style={{display:'flex', alignItems:'center', gap:6}}><input type="checkbox" checked={editingRutaForm.Excedente_Cobra} onChange={e=>setEditingRutaForm({...editingRutaForm, Excedente_Cobra: e.target.checked})} /> Cobrar excedente</label>
            <input type="number" value={editingRutaForm.Recargo_Excedente} onChange={e=>setEditingRutaForm({...editingRutaForm, Recargo_Excedente: e.target.value})} placeholder="Recargo_Excedente" />
            <div style={{display:'flex', gap:8}}><button type="submit">Guardar</button><button type="button" onClick={()=>setEditingRuta(null)}>Cancelar</button></div>
          </form>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete.show && (
        <div className="modal">
          <div className="modal-content">
            <h3>Confirmar eliminación</h3>
            <p>Eliminar {confirmDelete.type} — {confirmDelete.id}?</p>
            <div style={{display:'flex', gap:8}}><button onClick={performDelete}>Sí, eliminar</button><button onClick={()=>setConfirmDelete({ show:false, type:'', id:'' })}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
