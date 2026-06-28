import React from 'react'
import { loadData as loadRemoteData, saveData as saveRemoteData } from './sync'

const BASE_URL = import.meta.env.BASE_URL || '/'

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return { empresas: [], vehiculos: [], rutas: [] }
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas : []
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function formatCurrency(value) {
  try {
    return Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  } catch (e) {
    return '$' + value
  }
}

function formatNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return ''
  return numeric.toLocaleString('es-AR')
}

function rrppPerSeat(route) {
  if (!route || !route.RRPP_Cobra) return 0
  return Number(route.RRPP_Ganancia_Por_Asiento || 0)
}

function effectiveSeatPrice(route) {
  return Number(route?.Precio_Por_Pasajero || 0) + rrppPerSeat(route)
}

function resolveTrafficContext(route, empresaById, vehiculoById) {
  const vehicle = route?.ID_Vehiculo ? vehiculoById.get(route.ID_Vehiculo) : null
  const companyId = route?.ID_Empresa || vehicle?.ID_Empresa || ''
  const company = companyId ? (empresaById.get(companyId) || null) : null

  return { company, vehicle, companyId }
}

function vehiclesForCompany(companyId, vehiculoById) {
  if (!companyId) return []
  return Array.from(vehiculoById.values()).filter(vehicle => vehicle.ID_Empresa === companyId)
}

export default function ExpressSearch({ onBack }) {
  const [data, setData] = React.useState({ empresas: [], vehiculos: [], rutas: [] })
  const [origin, setOrigin] = React.useState('')
  const [destination, setDestination] = React.useState('')
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const remote = await loadRemoteData()
        if (remote && mounted) {
          setData(normalizeData(remote))
          return
        }

        const response = await fetch(`${BASE_URL}data.json`)
        if (response.ok) {
          const json = await response.json()
          if (!mounted) return
          const normalized = normalizeData(json)
          setData(normalized)
          try { await saveRemoteData(normalized) } catch (e) {}
        }
      } catch (e) {}
    })()

    return () => { mounted = false }
  }, [])

  const empresaById = React.useMemo(
    () => new Map((Array.isArray(data.empresas) ? data.empresas : []).map(item => [item.ID_Empresa, item])),
    [data]
  )
  const vehiculoById = React.useMemo(
    () => new Map((Array.isArray(data.vehiculos) ? data.vehiculos : []).map(item => [item.ID_Vehiculo, item])),
    [data]
  )

  const routes = React.useMemo(() => {
    const originKey = normalizeText(origin)
    const destinationKey = normalizeText(destination)
    const searchKey = normalizeText(query)

    return (Array.isArray(data.rutas) ? data.rutas : [])
      .filter(route => {
        const routeOrigin = normalizeText(route.Origen_Pueblo)
        const routeDestination = normalizeText(route.Destino_Final)
        const { company, vehicle } = resolveTrafficContext(route, empresaById, vehiculoById)
        const companyName = normalizeText(company.Nombre_Empresa || '')
        const vehicleName = normalizeText(vehicle?.Tipo_Vehiculo || vehicle?.ID_Vehiculo || route.ID_Vehiculo || '')
        const haystack = [routeOrigin, routeDestination, companyName, vehicleName, normalizeText(route.ID_Ruta)]

        const matchesOrigin = !originKey || routeOrigin.includes(originKey)
        const matchesDestination = !destinationKey || routeDestination.includes(destinationKey)
        const matchesSearch = !searchKey || haystack.some(value => value.includes(searchKey))
        return matchesOrigin && matchesDestination && matchesSearch
      })
      .flatMap(route => {
        const { company, vehicle, companyId } = resolveTrafficContext(route, empresaById, vehiculoById)
        const vehicles = vehiclesForCompany(companyId, vehiculoById)
        const vehicleList = vehicles.length > 0 ? vehicles : (vehicle ? [vehicle] : [])

        return vehicleList.map(companyVehicle => {
          const seats = Number(companyVehicle?.Capacidad_Asientos ?? companyVehicle?.Capacidad_Maxima ?? route.Capacidad_Asientos ?? 0)
          const extraSeats = Number(companyVehicle?.Capacidad_Excedente ?? route.Capacidad_Excedente ?? 0)
          return {
            ...route,
            companyId,
            companyName: company?.Nombre_Empresa || 'Sin empresa',
            vehicleName: companyVehicle?.Tipo_Vehiculo || companyVehicle?.ID_Vehiculo || route.ID_Vehiculo || 'Sin vehículo',
            unitId: companyVehicle?.ID_Vehiculo || route.ID_Vehiculo || '',
            seats,
            extraSeats,
            unitsAvailable: Number(companyVehicle?.Unidades_Disponibles ?? route.Unidades_Disponibles ?? 1),
            rrppSeatPrice: rrppPerSeat(route),
            pricePerPax: effectiveSeatPrice(route),
            basePrice: Number(route.Precio_Base || 0),
            recargoExcedente: Number(route.Recargo_Excedente || 0)
          }
        })
      })
      .sort((a, b) => {
        if (a.companyName !== b.companyName) return String(a.companyName).localeCompare(String(b.companyName), 'es')
        if (a.Destino_Final !== b.Destino_Final) return String(a.Destino_Final).localeCompare(String(b.Destino_Final), 'es')
        return String(a.Origen_Pueblo).localeCompare(String(b.Origen_Pueblo), 'es')
      })
  }, [data, origin, destination, query, empresaById, vehiculoById])

  const companiesCount = React.useMemo(() => new Set(routes.map(route => route.companyName)).size, [routes])

  return (
    <section className="details">
      <button className="back" onClick={onBack}>← Volver</button>
      <h2>Búsqueda express</h2>
      <p>Buscá transportes por origen y destino sin importar si están libres o ya usados en otra hoja. Sirve para consultar rápido empresa, precio y capacidad.</p>
      <p className="subtle-quote">Cada resultado muestra la empresa resuelta, el traffic, los asientos, el excedente y cuántas unidades tiene disponibles.</p>

      <div className="express-filter-grid" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Destino inicial</span>
          <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Ej: Del Campillo" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Destino final</span>
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Ej: Vicuña Mackenna" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Búsqueda libre</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Empresa, vehículo o ruta" />
        </label>
      </div>

      <div className="section-grid">
        <div className="section-card">
          <div className="label">Rutas encontradas</div>
          <div className="value">{routes.length}</div>
          <div className="hint">Coincidencias con los filtros cargados.</div>
        </div>
        <div className="section-card">
          <div className="label">Empresas</div>
          <div className="value">{companiesCount}</div>
          <div className="hint">Cantidad de empresas distintas en el resultado.</div>
        </div>
        <div className="section-card">
          <div className="label">Consulta rápida</div>
          <div className="value">Sin disponibilidad</div>
          <div className="hint">Muestra todos los transportes aunque estén usados o cargados en otra ruta.</div>
        </div>
      </div>

      <div className="express-mobile-results">
        {routes.map(route => (
          <article className="section-card express-result-card" key={`mobile-${route.ID_Ruta}-${route.unitId || route.ID_Vehiculo || route.ID_Empresa || route.Origen_Pueblo}-${route.Destino_Final}`}>
            <div className="label">{route.companyName}</div>
            <div className="value">{route.vehicleName}</div>
            <div className="express-route-line">{route.Origen_Pueblo || 'Sin origen'} a {route.Destino_Final || 'Sin destino'}</div>
            <dl className="express-result-facts">
              <div>
                <dt>Asientos</dt>
                <dd>{formatNumber(route.seats) || '0'}</dd>
              </div>
              <div>
                <dt>Excedente</dt>
                <dd>{formatNumber(route.extraSeats) || '0'}</dd>
              </div>
              <div>
                <dt>Unidades</dt>
                <dd>{formatNumber(route.unitsAvailable) || '0'}</dd>
              </div>
              <div>
                <dt>Precio pax</dt>
                <dd>{formatCurrency(route.pricePerPax)}</dd>
              </div>
              <div>
                <dt>RRPP x asiento</dt>
                <dd>{formatCurrency(route.rrppSeatPrice)}</dd>
              </div>
              <div>
                <dt>Precio base</dt>
                <dd>{formatCurrency(route.basePrice)}</dd>
              </div>
              <div>
                <dt>Recargo</dt>
                <dd>{formatCurrency(route.recargoExcedente)}</dd>
              </div>
            </dl>
            <div className="subtle-quote">Ruta: {route.ID_Ruta || 'Sin ID'}</div>
          </article>
        ))}
      </div>

      <div className="table-scroll express-desktop-results">
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, minWidth: 1280 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Empresa</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Traffic</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Origen</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Destino</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Asientos</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Excedente</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Unidades</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Precio pax</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>RRPP x asiento</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Precio base</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Recargo excedente</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Ruta</th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => (
              <tr key={`${route.ID_Ruta}-${route.unitId || route.ID_Vehiculo || route.ID_Empresa || route.Origen_Pueblo}-${route.Destino_Final}`}>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{route.companyName}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{route.vehicleName}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{route.Origen_Pueblo || 'Sin origen'}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{route.Destino_Final || 'Sin destino'}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatNumber(route.seats)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatNumber(route.extraSeats)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatNumber(route.unitsAvailable)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatCurrency(route.pricePerPax)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatCurrency(route.rrppSeatPrice)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatCurrency(route.basePrice)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatCurrency(route.recargoExcedente)}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{route.ID_Ruta || 'Sin ID'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}