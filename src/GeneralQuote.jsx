import React from 'react'
import SAMPLE from './data/sampleData'
import { mergeTownOptions } from './data/predefinedTowns'
import { loadData as loadRemoteData, saveData as saveRemoteData, loadRouteSheets, saveRouteSheets } from './sync'

const BASE_URL = import.meta.env.BASE_URL || '/'
const SHEETS_KEY = 'snt_route_sheets_v1'

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return SAMPLE
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas : []
  }
}

function formatCurrency(value) {
  try {
    return Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  } catch (e) {
    return '$' + value
  }
}

function displayNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return ''
  return value
}

function displayCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return ''
  return formatCurrency(value)
}

function inputNumberOrBlank(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return ''
  return value
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function readSheetsFromStorage() {
  try {
    const raw = localStorage.getItem(SHEETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function writeSheetsToStorage(sheets) {
  try {
    if (!Array.isArray(sheets) || sheets.length === 0) return
    localStorage.setItem(SHEETS_KEY, JSON.stringify(sheets))
  } catch (e) {}
}

function uniqueDestinations(rutas) {
  return Array.from(new Set((Array.isArray(rutas) ? rutas : []).map(r => r.Destino_Final).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
}

function uniqueOriginsForDestination(rutas, destination) {
  const destinationKey = normalizeText(destination)
  if (!destinationKey) return mergeTownOptions()
  return mergeTownOptions(
    Array.from(
      new Set(
        (Array.isArray(rutas) ? rutas : [])
          .filter(r => normalizeText(r.Destino_Final) === destinationKey)
          .map(r => r.Origen_Pueblo)
          .filter(Boolean)
      )
    )
  )
}

function companyIdFromRoute(route, vehicleById) {
  if (!route) return ''
  if (route.ID_Empresa) return route.ID_Empresa
  const vehicle = vehicleById.get(route.ID_Vehiculo)
  return vehicle?.ID_Empresa || ''
}

function companyIdsForDestination(rutas, vehiculos, destination) {
  const destinationKey = normalizeText(destination)
  if (!destinationKey) return []

  const vehicleById = new Map((Array.isArray(vehiculos) ? vehiculos : []).map(v => [v.ID_Vehiculo, v]))
  return Array.from(
    new Set(
      (Array.isArray(rutas) ? rutas : [])
        .filter(r => normalizeText(r.Destino_Final) === destinationKey)
        .map(r => companyIdFromRoute(r, vehicleById))
        .filter(Boolean)
    )
  )
}

function isCompanyAvailableOnDate(company, eventDate) {
  if (!eventDate) return true
  const blocked = Array.isArray(company?.Fechas_No_Disponibles) ? company.Fechas_No_Disponibles : []
  return !blocked.includes(eventDate)
}

function availableCompanyIdsForDestination(rutas, vehiculos, empresas, destination, eventDate) {
  const companyIds = companyIdsForDestination(rutas, vehiculos, destination)
  return companyIds
}

function buildDemandForDestination(sheet, rutas, destination) {
  const origins = uniqueOriginsForDestination(rutas, destination)
  const current = sheet?.demandByTown || {}
  return origins.reduce((acc, origin) => {
    acc[origin] = Math.max(0, Number(current[origin] || 0))
    return acc
  }, {})
}

function suggestedPricesForDestination(rutas, destination) {
  const destinationKey = normalizeText(destination)
  return (Array.isArray(rutas) ? rutas : []).reduce((acc, route) => {
    if (normalizeText(route.Destino_Final) !== destinationKey) return acc
    const townKey = normalizeText(route.Origen_Pueblo)
    const price = Number(route.Precio_Por_Pasajero || 0)
    if (townKey && price > 0 && !acc[townKey]) acc[townKey] = price
    return acc
  }, {})
}

function ensurePricesForDemand(currentPrices, rutas, destination, demandByTown) {
  const suggested = suggestedPricesForDestination(rutas, destination)
  const pricesByTown = { ...(currentPrices || {}) }
  Object.keys(demandByTown || {}).forEach(town => {
    const townKey = normalizeText(town)
    if (Number(pricesByTown[townKey] || 0) <= 0 && suggested[townKey]) {
      pricesByTown[townKey] = suggested[townKey]
    }
    if (pricesByTown[townKey] === undefined) pricesByTown[townKey] = 0
  })
  return pricesByTown
}

function createNewSheet(rutas, base = null) {
  const destinations = uniqueDestinations(rutas)
  const destinationCity = base?.destinationCity || destinations[0] || ''
  const demandByTown = base?.demandByTown || buildDemandForDestination({ demandByTown: {} }, rutas, destinationCity)
  const pricesByTown = ensurePricesForDemand(base?.pricesByTown || {}, rutas, destinationCity, demandByTown)

  return {
    id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    eventDate: base?.eventDate || todayIso(),
    eventName: base?.eventName || '',
    destinationCity,
    cityLabel: base?.cityLabel || destinationCity,
    allowExcedente: base?.allowExcedente ?? true,
    selectedCompanyIds: Array.isArray(base?.selectedCompanyIds) ? base.selectedCompanyIds : [],
    demandByTown,
    pricesByTown,
    reboundSelectionByUnit: base?.reboundSelectionByUnit && typeof base.reboundSelectionByUnit === 'object' ? base.reboundSelectionByUnit : {},
    reboundConfigByUnit: base?.reboundConfigByUnit && typeof base.reboundConfigByUnit === 'object' ? base.reboundConfigByUnit : {},
    lastCalculatedAt: base?.lastCalculatedAt || '',
    lastSummary: base?.lastSummary || null,
    createdAt: base?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function buildUnitsForDestination(data, destination, allowExcedente, selectedCompanyIds = []) {
  const vehiculos = Array.isArray(data?.vehiculos) ? data.vehiculos : []
  const rutas = Array.isArray(data?.rutas) ? data.rutas : []
  const empresas = Array.isArray(data?.empresas) ? data.empresas : []
  const allowedCompanies = new Set((Array.isArray(selectedCompanyIds) ? selectedCompanyIds : []).filter(Boolean))

  const destinationKey = normalizeText(destination)
  const filteredRoutes = rutas.filter(r => normalizeText(r.Destino_Final) === destinationKey)
  const empresasById = new Map(empresas.map(e => [e.ID_Empresa, e]))
  const vehiclesById = new Map(vehiculos.map(v => [v.ID_Vehiculo, v]))
  
  // Agrupar rutas por empresa
  const routesByCompany = new Map()
  filteredRoutes.forEach(route => {
    const companyId = companyIdFromRoute(route, vehiclesById)
    if (!companyId) return
    const list = routesByCompany.get(companyId) || []
    list.push(route)
    routesByCompany.set(companyId, list)
  })

  const units = []

  vehiculos.forEach(vehicle => {
    const companyId = vehicle.ID_Empresa
    if (allowedCompanies.size > 0 && !allowedCompanies.has(companyId)) return

    // Esta empresa tiene rutas a este destino?
    const routesForCompany = routesByCompany.get(companyId) || []
    if (routesForCompany.length === 0) return

    const seats = Number(vehicle.Capacidad_Asientos ?? vehicle.Capacidad_Maxima ?? 0)
    const extra = Number(vehicle.Capacidad_Excedente ?? 0)
    const totalCap = seats + (allowExcedente ? extra : 0)
    const unitsCount = Math.max(0, Number(vehicle.Unidades_Disponibles ?? 1))
    const company = empresasById.get(companyId) || {}

    // Este vehículo puede hacer cualquiera de las rutas de su empresa a este destino
    const options = routesForCompany.map(route => ({
      route,
      company,
      vehicle,
      seats,
      extra: allowExcedente ? extra : 0,
      capacity: totalCap,
      townKey: normalizeText(route.Origen_Pueblo),
      townLabel: route.Origen_Pueblo || 'Sin origen'
    }))

    for (let idx = 1; idx <= unitsCount; idx += 1) {
      units.push({
        unitId: `${vehicle.ID_Vehiculo}-U${idx}`,
        company,
        vehicle,
        options,
        maxCapacity: options.reduce((max, option) => Math.max(max, option.capacity), 0)
      })
    }
  })

  units.sort((a, b) => b.maxCapacity - a.maxCapacity)
  return units
}

function routeCostForPassengers(option, passengers) {
  const base = Number(option.route.Precio_Base || 0)
  const recargo = Number(option.route.Recargo_Excedente || 0)
  const extraUsed = Math.max(0, passengers - option.seats)
  const extraCost = option.route.Excedente_Cobra ? (recargo * extraUsed) : 0

  if (option.route.Modalidad_Cobro === 'Por Pasajero') {
    return { cost: (base * passengers) + extraCost, extraUsed }
  }

  return { cost: base + extraCost, extraUsed }
}

function optimizeScenarios(units, demandByTown, topK = 3) {
  const demandKeys = Object.keys(demandByTown).filter(key => Number(demandByTown[key]) > 0)
  const totalDemand = demandKeys.reduce((sum, key) => sum + Number(demandByTown[key] || 0), 0)

  const suffixCapacity = new Array(units.length + 1).fill(0)
  for (let idx = units.length - 1; idx >= 0; idx -= 1) {
    suffixCapacity[idx] = suffixCapacity[idx + 1] + Number(units[idx].maxCapacity || 0)
  }

  const scenarios = []
  const signatures = new Set()
  let bestAssigned = 0

  function compare(a, b) {
    if (a.totalAssigned !== b.totalAssigned) return b.totalAssigned - a.totalAssigned
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost
    return a.assignments.length - b.assignments.length
  }

  function scenarioSignature(assignments) {
    return assignments
      .map(item => `${item.unitId}|${item.routeId}|${item.assigned}`)
      .sort()
      .join('||')
  }

  function storeScenario(scenario) {
    const sign = scenarioSignature(scenario.assignments)
    if (signatures.has(sign)) return
    signatures.add(sign)

    scenarios.push(scenario)
    scenarios.sort(compare)

    if (scenarios.length > topK) {
      const removed = scenarios.pop()
      signatures.delete(scenarioSignature(removed.assignments))
    }

    bestAssigned = Math.max(bestAssigned, scenario.totalAssigned)
  }

  function sumRemaining(remaining) {
    return demandKeys.reduce((sum, key) => sum + Number(remaining[key] || 0), 0)
  }

  function dfs(unitIndex, remaining, assignments, totalAssigned, totalCost) {
    const pending = sumRemaining(remaining)
    const bound = totalAssigned + Math.min(pending, suffixCapacity[unitIndex])
    if (bound < bestAssigned) return

    if (unitIndex >= units.length || pending <= 0) {
      const breakdown = demandKeys.map(key => {
        const demand = Number(demandByTown[key] || 0)
        const withoutSeat = Number(remaining[key] || 0)
        return {
          townKey: key,
          demand,
          assigned: demand - withoutSeat,
          withoutSeat
        }
      })

      storeScenario({
        id: stableScenarioId('SC', assignments),
        assignments: [...assignments],
        totalDemand,
        totalAssigned,
        totalCost,
        totalWithoutSeat: totalDemand - totalAssigned,
        totalEmptySeats: assignments.reduce((sum, item) => sum + item.emptySeats, 0),
        breakdown
      })
      return
    }

    const unit = units[unitIndex]
    const options = []

    unit.options.forEach(option => {
      const needed = Number(remaining[option.townKey] || 0)
      if (needed <= 0 || option.capacity <= 0) return

      const assigned = Math.min(needed, option.capacity)
      const costInfo = routeCostForPassengers(option, assigned)

      options.push({
        option,
        assigned,
        cost: costInfo.cost,
        extraUsed: costInfo.extraUsed,
        costPerPassenger: costInfo.cost / Math.max(1, assigned)
      })
    })

    options.sort((a, b) => {
      if (a.assigned !== b.assigned) return b.assigned - a.assigned
      return a.costPerPassenger - b.costPerPassenger
    })

    options.forEach(choice => {
      const townKey = choice.option.townKey
      remaining[townKey] = Number(remaining[townKey] || 0) - choice.assigned

      assignments.push({
        unitId: unit.unitId,
        routeId: choice.option.route.ID_Ruta,
        companyId: choice.option.company.ID_Empresa || '',
        companyName: choice.option.company.Nombre_Empresa || 'Empresa s/d',
        vehicleType: choice.option.vehicle.Tipo_Vehiculo || choice.option.vehicle.ID_Vehiculo,
        townKey,
        townLabel: choice.option.townLabel,
        destination: choice.option.route.Destino_Final || '',
        modalidad: choice.option.route.Modalidad_Cobro || 'Viaje Cerrado',
        assigned: choice.assigned,
        seats: choice.option.seats,
        extraAllowed: choice.option.extra,
        extraUsed: choice.extraUsed,
        capacity: choice.option.capacity,
        emptySeats: Math.max(0, choice.option.capacity - choice.assigned),
        cost: choice.cost,
        precioPorPasajero: Number(choice.option.route.Precio_Por_Pasajero || 0)
      })

      dfs(unitIndex + 1, remaining, assignments, totalAssigned + choice.assigned, totalCost + choice.cost)

      assignments.pop()
      remaining[townKey] = Number(remaining[townKey] || 0) + choice.assigned
    })

    dfs(unitIndex + 1, remaining, assignments, totalAssigned, totalCost)
  }

  const initialRemaining = demandKeys.reduce((acc, key) => {
    acc[key] = Number(demandByTown[key] || 0)
    return acc
  }, {})

  dfs(0, initialRemaining, [], 0, 0)

  if (scenarios.length === 0) {
    scenarios.push({
      id: 'SC-EMPTY',
      assignments: [],
      totalDemand,
      totalAssigned: 0,
      totalCost: 0,
      totalWithoutSeat: totalDemand,
      totalEmptySeats: 0,
      breakdown: demandKeys.map(key => ({
        townKey: key,
        demand: Number(demandByTown[key] || 0),
        assigned: 0,
        withoutSeat: Number(demandByTown[key] || 0)
      }))
    })
  }

  return scenarios.map((scenario, idx) => ({ ...scenario, rank: idx + 1 }))
}

function scenarioSignature(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .map(item => `${item.unitId}|${item.routeId}|${item.townKey}|${item.assigned}`)
    .sort()
    .join('||')
}

function hashText(text) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function stableScenarioId(prefix, assignments) {
  return `${prefix}-${hashText(scenarioSignature(assignments))}`
}

function buildRevenuePriorityScenario(units, demandByTown, pricesByTown = {}) {
  const demandKeys = Object.keys(demandByTown || {}).filter(key => Number(demandByTown[key]) > 0)
  if (demandKeys.length === 0) return null

  const totalDemand = demandKeys.reduce((sum, key) => sum + Number(demandByTown[key] || 0), 0)
  const remaining = demandKeys.reduce((acc, key) => {
    acc[key] = Number(demandByTown[key] || 0)
    return acc
  }, {})

  const assignments = []
  let totalAssigned = 0
  let totalCost = 0

  units.forEach(unit => {
    const choices = []

    unit.options.forEach(option => {
      const needed = Number(remaining[option.townKey] || 0)
      if (needed <= 0 || option.capacity <= 0) return

      const assigned = Math.min(needed, option.capacity)
      const costInfo = routeCostForPassengers(option, assigned)
      const pricePerPax = Number(pricesByTown[option.townKey] ?? option.route.Precio_Por_Pasajero ?? 0)
      const revenue = pricePerPax * assigned
      const balance = revenue - costInfo.cost

      choices.push({ option, assigned, cost: costInfo.cost, extraUsed: costInfo.extraUsed, revenue, balance })
    })

    if (!choices.length) return

    choices.sort((a, b) => {
      if (a.balance !== b.balance) return b.balance - a.balance
      if (a.revenue !== b.revenue) return b.revenue - a.revenue
      return b.assigned - a.assigned
    })

    const bestChoice = choices[0]
    if (bestChoice.balance <= 0) return

    const townKey = bestChoice.option.townKey
    remaining[townKey] = Number(remaining[townKey] || 0) - bestChoice.assigned

    assignments.push({
      unitId: unit.unitId,
      routeId: bestChoice.option.route.ID_Ruta,
      companyId: bestChoice.option.company.ID_Empresa || '',
      companyName: bestChoice.option.company.Nombre_Empresa || 'Empresa s/d',
      vehicleType: bestChoice.option.vehicle.Tipo_Vehiculo || bestChoice.option.vehicle.ID_Vehiculo,
      townKey,
      townLabel: bestChoice.option.townLabel,
      destination: bestChoice.option.route.Destino_Final || '',
      modalidad: bestChoice.option.route.Modalidad_Cobro || 'Viaje Cerrado',
      assigned: bestChoice.assigned,
      seats: bestChoice.option.seats,
      extraAllowed: bestChoice.option.extra,
      extraUsed: bestChoice.extraUsed,
      capacity: bestChoice.option.capacity,
      emptySeats: Math.max(0, bestChoice.option.capacity - bestChoice.assigned),
      cost: bestChoice.cost,
      precioPorPasajero: Number(bestChoice.option.route.Precio_Por_Pasajero || 0)
    })

    totalAssigned += bestChoice.assigned
    totalCost += bestChoice.cost
  })

  if (!assignments.length) return null

  const breakdown = demandKeys.map(key => {
    const demand = Number(demandByTown[key] || 0)
    const withoutSeat = Number(remaining[key] || 0)
    return {
      townKey: key,
      demand,
      assigned: demand - withoutSeat,
      withoutSeat
    }
  })

  return {
    id: stableScenarioId('SC-STRAT', assignments),
    assignments,
    totalDemand,
    totalAssigned,
    totalCost,
    totalWithoutSeat: totalDemand - totalAssigned,
    totalEmptySeats: assignments.reduce((sum, item) => sum + Number(item.emptySeats || 0), 0),
    breakdown
  }
}

function computeFinancials(scenario, pricesByTown = {}) {
  const rows = (scenario?.assignments || []).map((item, index) => {
    const pricePerPax = Number(pricesByTown[item.townKey] ?? item.precioPorPasajero ?? 0)
    const revenue = pricePerPax * Number(item.assigned || 0)
    const balance = revenue - Number(item.cost || 0)
    return {
      ...item,
      groupNumber: index + 1,
      groupLabel: `Grupo ${index + 1}`,
      pricePerPax,
      revenue,
      balance
    }
  })
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const totalBalance = totalRevenue - Number(scenario?.totalCost || 0)
  const totalCapacity = rows.reduce((sum, row) => sum + Number(row.capacity || 0), 0)
  const totalEmptySeats = Number(scenario?.totalEmptySeats || 0)
  const townRows = (scenario?.breakdown || []).map(item => {
    const townRows = rows.filter(row => row.townKey === item.townKey)
    const revenue = townRows.reduce((sum, row) => sum + row.revenue, 0)
    const cost = townRows.reduce((sum, row) => sum + Number(row.cost || 0), 0)
    const emptySeats = townRows.reduce((sum, row) => sum + Number(row.emptySeats || 0), 0)
    return {
      ...item,
      pricePerPax: Number(pricesByTown[item.townKey] || 0),
      revenue,
      cost,
      emptySeats,
      balance: revenue - cost
    }
  })
  return { rows, townRows, totalRevenue, totalBalance, totalCapacity, totalEmptySeats }
}

function estimateReboundDelayMinutes(route) {
  const base = Number(route?.Precio_Base || 0)
  const perPassenger = Number(route?.Precio_Por_Pasajero || 0)
  const rough = 24 + Math.round(base / 22000) + Math.round(perPassenger / 3000)
  return Math.max(20, Math.min(140, rough))
}

function reboundRouteId(eventCity, targetTownKey, unitId) {
  const from = String(eventCity || 'EVT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'EVT'
  const to = String(targetTownKey || 'TWN').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'TWN'
  const unit = String(unitId || 'UNIT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'UNIT'
  return `REB-${from}-${to}-${unit}`
}

function buildRecommendations(scenarios, pricesByTown = {}) {
  const scored = (Array.isArray(scenarios) ? scenarios : []).map(scenario => {
    const financials = computeFinancials(scenario, pricesByTown)
    const demandScore = scenario.totalDemand ? scenario.totalAssigned / scenario.totalDemand : 0
    const emptyScore = financials.totalCapacity ? 1 - (scenario.totalEmptySeats / financials.totalCapacity) : 1
    const revenueBase = Math.max(1, Math.abs(financials.totalRevenue), Math.abs(scenario.totalCost || 0))
    const moneyScore = Math.max(-1, Math.min(1, financials.totalBalance / revenueBase))
    return {
      scenario,
      financials,
      balanceScore: (demandScore * 0.45) + (((moneyScore + 1) / 2) * 0.35) + (emptyScore * 0.20)
    }
  })

  const byPrice = [...scored].sort((a, b) => {
    if (a.financials.totalBalance !== b.financials.totalBalance) return b.financials.totalBalance - a.financials.totalBalance
    if (a.financials.totalRevenue !== b.financials.totalRevenue) return b.financials.totalRevenue - a.financials.totalRevenue
    return a.scenario.totalCost - b.scenario.totalCost
  })[0]

  const byPeople = [...scored].sort((a, b) => {
    if (a.scenario.totalAssigned !== b.scenario.totalAssigned) return b.scenario.totalAssigned - a.scenario.totalAssigned
    if (a.scenario.totalWithoutSeat !== b.scenario.totalWithoutSeat) return a.scenario.totalWithoutSeat - b.scenario.totalWithoutSeat
    if (a.scenario.totalEmptySeats !== b.scenario.totalEmptySeats) return a.scenario.totalEmptySeats - b.scenario.totalEmptySeats
    return a.scenario.totalCost - b.scenario.totalCost
  })[0]

  const byBalance = [...scored].sort((a, b) => {
    if (a.balanceScore !== b.balanceScore) return b.balanceScore - a.balanceScore
    if (a.scenario.totalAssigned !== b.scenario.totalAssigned) return b.scenario.totalAssigned - a.scenario.totalAssigned
    return b.financials.totalBalance - a.financials.totalBalance
  })[0]

  const strategic = scored.find(item => String(item?.scenario?.id || '').startsWith('SC-STRAT-'))
  const strategicLooksLikePrice = strategic && byPrice
    ? (
        strategic.scenario.id === byPrice.scenario.id ||
        (
          Math.abs(Number(strategic.financials.totalBalance || 0) - Number(byPrice.financials.totalBalance || 0)) < 1 &&
          Number(strategic.scenario.totalAssigned || 0) === Number(byPrice.scenario.totalAssigned || 0) &&
          Number(strategic.scenario.totalWithoutSeat || 0) === Number(byPrice.scenario.totalWithoutSeat || 0)
        )
      )
    : false

  return [
    byPrice && { id: 'price', title: 'Mejor por precio', description: 'Prioriza la mayor ganancia segun el precio cobrado por pueblo.', ...byPrice },
    byPeople && { id: 'people', title: 'Mejor por cantidad de gente', description: 'Prioriza ubicar la mayor cantidad de pasajeros.', ...byPeople },
    byBalance && { id: 'balance', title: 'Balance lugares/precio', description: 'Equilibra pasajeros ubicados, lugares vacíos y ganancia final.', ...byBalance },
    strategic && !strategicLooksLikePrice && { id: 'strategic-revenue', title: 'Mayor recaudacion estratégica', description: 'Puede dejar pasajeros sin lugar en rutas caras para concentrar unidades donde la recaudacion es más positiva.', ...strategic }
  ].filter(Boolean)
}

export default function GeneralQuote({ initialSheetId = '' } = {}) {
  const [data, setData] = React.useState(() => SAMPLE)
  const [dataReady, setDataReady] = React.useState(false)
  const [sheets, setSheets] = React.useState([])
  const [activeSheetId, setActiveSheetId] = React.useState('')
  const [scenarios, setScenarios] = React.useState([])
  const [selectedScenarioId, setSelectedScenarioId] = React.useState('')
  const [comparisonSummary, setComparisonSummary] = React.useState(null)
  const [minFreeSeats, setMinFreeSeats] = React.useState(0)
  const [simulationUnitId, setSimulationUnitId] = React.useState('')
  const [simulationTargetTownKey, setSimulationTargetTownKey] = React.useState('')
  const [reboundSelectionByUnit, setReboundSelectionByUnit] = React.useState({})
  const [reboundConfigByUnit, setReboundConfigByUnit] = React.useState({})
  const [reboundHydratedSheetId, setReboundHydratedSheetId] = React.useState('')
  const [reportCompanyId, setReportCompanyId] = React.useState('')

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const remote = await loadRemoteData()
        if (remote && mounted) {
          setData(normalizeData(remote))
          setDataReady(true)
          return
        }

        const response = await fetch(`${BASE_URL}data.json`)
        if (response.ok) {
          const json = await response.json()
          if (!mounted) return
          const normalized = normalizeData(json)
          setData(normalized)
          setDataReady(true)
          try { await saveRemoteData(normalized) } catch (e) {}
        }
      } catch (e) {
        if (mounted) setDataReady(true)
      }
    })()

    return () => { mounted = false }
  }, [])

  const rutas = Array.isArray(data?.rutas) ? data.rutas : []
  const vehiculos = Array.isArray(data?.vehiculos) ? data.vehiculos : []
  const empresas = Array.isArray(data?.empresas) ? data.empresas : []
  const destinations = React.useMemo(() => uniqueDestinations(rutas), [rutas])
  const destinationOptions = React.useMemo(() => mergeTownOptions(destinations), [destinations])

  const activeSheet = React.useMemo(
    () => sheets.find(sheet => sheet.id === activeSheetId) || null,
    [sheets, activeSheetId]
  )

  React.useEffect(() => {
    if (!initialSheetId) return
    if (!sheets.some(sheet => sheet.id === initialSheetId)) return
    setActiveSheetId(prev => (prev === initialSheetId ? prev : initialSheetId))
  }, [initialSheetId, sheets])

  React.useEffect(() => {
    if (!dataReady) return
    if (!Array.isArray(rutas) || rutas.length === 0) return
    let mounted = true
    ;(async () => {
      const remoteSheets = await loadRouteSheets()
      if (!mounted) return

      const saved = remoteSheets.length ? remoteSheets : readSheetsFromStorage()
      const baseSheets = saved.length > 0
        ? saved.map(item => ({
            ...item,
            demandByTown: item?.demandByTown && typeof item.demandByTown === 'object' ? item.demandByTown : {},
            selectedCompanyIds: Array.isArray(item?.selectedCompanyIds) ? item.selectedCompanyIds : [],
            reboundSelectionByUnit: item?.reboundSelectionByUnit && typeof item.reboundSelectionByUnit === 'object' ? item.reboundSelectionByUnit : {},
            reboundConfigByUnit: item?.reboundConfigByUnit && typeof item.reboundConfigByUnit === 'object' ? item.reboundConfigByUnit : {},
            pricingMode: item?.pricingMode || 'suggested',
            customSeatPrice: item?.customSeatPrice || ''
          }))
        : [createNewSheet(rutas)]

      const normalized = baseSheets.map(sheet => {
        const destinationCity = sheet.destinationCity || destinations[0] || ''
        const validCompanyIds = availableCompanyIdsForDestination(rutas, vehiculos, empresas, destinationCity, sheet.eventDate || '')
        const demandByTown = buildDemandForDestination(sheet, rutas, destinationCity)
        const pricesByTown = ensurePricesForDemand(sheet?.pricesByTown || {}, rutas, destinationCity, demandByTown)

        return {
          ...sheet,
          destinationCity,
          demandByTown,
          pricesByTown,
          selectedCompanyIds: (sheet.selectedCompanyIds || []).filter(id => validCompanyIds.includes(id))
        }
      })

      setSheets(normalized)
      setActiveSheetId(prev => prev && normalized.some(sheet => sheet.id === prev) ? prev : (normalized[0]?.id || ''))
      writeSheetsToStorage(normalized)
    })()

    return () => { mounted = false }
  }, [dataReady, rutas, vehiculos, empresas, destinations])

  React.useEffect(() => {
    if (!sheets.length) return
    writeSheetsToStorage(sheets)
    saveRouteSheets(sheets).catch(() => {})
  }, [sheets])

  React.useEffect(() => {
    if (!activeSheet) return
    setReboundSelectionByUnit(activeSheet.reboundSelectionByUnit && typeof activeSheet.reboundSelectionByUnit === 'object' ? activeSheet.reboundSelectionByUnit : {})
    setReboundConfigByUnit(activeSheet.reboundConfigByUnit && typeof activeSheet.reboundConfigByUnit === 'object' ? activeSheet.reboundConfigByUnit : {})
    setReboundHydratedSheetId(activeSheetId || '')
  }, [activeSheetId, activeSheet?.reboundSelectionByUnit, activeSheet?.reboundConfigByUnit])

  const activeReboundSelectionKey = React.useMemo(() => JSON.stringify(reboundSelectionByUnit || {}), [reboundSelectionByUnit])
  const activeReboundConfigKey = React.useMemo(() => JSON.stringify(reboundConfigByUnit || {}), [reboundConfigByUnit])

  React.useEffect(() => {
    if (!activeSheet) return
    if (reboundHydratedSheetId !== activeSheetId) return
    const sheetSelectionKey = JSON.stringify(activeSheet.reboundSelectionByUnit || {})
    const sheetConfigKey = JSON.stringify(activeSheet.reboundConfigByUnit || {})
    if (sheetSelectionKey === activeReboundSelectionKey && sheetConfigKey === activeReboundConfigKey) return

    updateActiveSheet(sheet => ({
      ...sheet,
      reboundSelectionByUnit: reboundSelectionByUnit || {},
      reboundConfigByUnit: reboundConfigByUnit || {}
    }))
  }, [activeSheetId, activeSheet, activeReboundSelectionKey, activeReboundConfigKey, reboundHydratedSheetId])

  React.useEffect(() => {
    if (!activeSheetId || !activeSheet) return
    const totalDemand = Object.values(activeSheet.demandByTown || {}).reduce((sum, value) => sum + Number(value || 0), 0)
    if (totalDemand <= 0) {
      setScenarios([])
      setSelectedScenarioId('')
      setComparisonSummary(null)
      return
    }

    calculateBestOptions({
      silent: true,
      preferredScenarioId: activeSheet.selectedScenarioId || ''
    })
  }, [activeSheetId])

  const origins = React.useMemo(() => {
    if (!activeSheet) return []
    return uniqueOriginsForDestination(rutas, activeSheet.destinationCity)
  }, [rutas, activeSheet])

  const allCompaniesForSelection = React.useMemo(
    () => empresas
      .slice()
      .sort((a, b) => String(a.Nombre_Empresa || '').localeCompare(String(b.Nombre_Empresa || ''), 'es')),
    [empresas]
  )

  const availableCompanyIdsForCurrentDestination = React.useMemo(() => {
    if (!activeSheet?.destinationCity) return new Set()
    return new Set(
      availableCompanyIdsForDestination(rutas, vehiculos, empresas, activeSheet.destinationCity, activeSheet.eventDate || '')
    )
  }, [activeSheet, rutas, vehiculos, empresas])

  const selectedScenario = React.useMemo(() => {
    if (!scenarios.length) return null
    return scenarios.find(item => item.id === selectedScenarioId) || scenarios[0]
  }, [scenarios, selectedScenarioId])

  const recommendations = React.useMemo(
    () => buildRecommendations(scenarios, activeSheet?.pricesByTown || {}),
    [scenarios, activeSheet?.pricesByTown]
  )

  const financials = React.useMemo(
    () => selectedScenario ? computeFinancials(selectedScenario, activeSheet?.pricesByTown || {}) : null,
    [selectedScenario, activeSheet?.pricesByTown]
  )

  const availabilityByUnit = React.useMemo(() => {
    if (!financials?.rows) return []
    return financials.rows
      .map(row => {
        const baseAvailable = Math.max(0, Number(row.seats || 0) - Number(row.assigned || 0))
        const extraAvailable = Math.max(0, Number(row.extraAllowed || 0) - Number(row.extraUsed || 0))
        return {
          ...row,
          baseAvailable,
          extraAvailable,
          totalAvailable: Math.max(0, Number(row.emptySeats || 0)),
          usingExtra: Number(row.extraUsed || 0) > 0
        }
      })
      .filter(row => row.totalAvailable > 0 || row.usingExtra)
      .sort((a, b) => b.totalAvailable - a.totalAvailable)
  }, [financials])

  const withoutSeatByTown = React.useMemo(() => {
    if (!selectedScenario?.breakdown) return []
    return selectedScenario.breakdown
      .filter(item => Number(item.withoutSeat || 0) > 0)
      .map(item => ({
        townKey: item.townKey,
        townName: townLabel(item.townKey),
        withoutSeat: Number(item.withoutSeat || 0),
        demand: Number(item.demand || 0),
        assigned: Number(item.assigned || 0)
      }))
      .sort((a, b) => b.withoutSeat - a.withoutSeat)
  }, [selectedScenario, origins])

  const withoutSeatByTownMap = React.useMemo(
    () => new Map(withoutSeatByTown.map(item => [item.townKey, Number(item.withoutSeat || 0)])),
    [withoutSeatByTown]
  )

  const selectedCompanyIdsForSimulation = React.useMemo(() => {
    const selected = Array.isArray(activeSheet?.selectedCompanyIds) ? activeSheet.selectedCompanyIds : []
    const available = Array.from(availableCompanyIdsForCurrentDestination || [])
    if (selected.length > 0) return selected.filter(id => available.includes(id))
    return available
  }, [activeSheet, availableCompanyIdsForCurrentDestination])

  const unitsForSimulation = React.useMemo(() => {
    if (!activeSheet?.destinationCity) return []
    return buildUnitsForDestination(
      data,
      activeSheet.destinationCity,
      true,
      selectedCompanyIdsForSimulation
    )
  }, [data, activeSheet, selectedCompanyIdsForSimulation])

  const unitByIdForSimulation = React.useMemo(
    () => new Map(unitsForSimulation.map(unit => [unit.unitId, unit])),
    [unitsForSimulation]
  )

  const reassignmentSimulations = React.useMemo(() => {
    if (!selectedScenario || !financials || !activeSheet?.destinationCity) return []
    if (!withoutSeatByTown.length) return []

    const shortageByTown = new Map(
      withoutSeatByTown.map(item => [item.townKey, Number(item.withoutSeat || 0)])
    )

    const unitById = new Map(unitsForSimulation.map(unit => [unit.unitId, unit]))

    const simulations = []

    ;(financials.rows || []).forEach(row => {
      const unit = unitById.get(row.unitId)
      if (!unit) return

      unit.options.forEach(option => {
        if (option.townKey === row.townKey) return
        const neededAtTarget = Number(shortageByTown.get(option.townKey) || 0)
        if (neededAtTarget <= 0) return

        const reassigned = Math.min(neededAtTarget, Number(option.capacity || 0))
        if (reassigned <= 0) return

        const newCostInfo = routeCostForPassengers(option, reassigned)
        const newPricePerPax = Number(activeSheet?.pricesByTown?.[option.townKey] ?? option.route.Precio_Por_Pasajero ?? 0)
        const newRevenue = newPricePerPax * reassigned
        const newBalance = newRevenue - newCostInfo.cost

        const currentAssigned = Number(row.assigned || 0)
        const currentBalance = Number(row.balance || 0)
        const deltaBalance = newBalance - currentBalance
        const netMissingDelta = currentAssigned - reassigned

        simulations.push({
          unitId: row.unitId,
          companyName: row.companyName,
          vehicleType: row.vehicleType,
          fromTownKey: row.townKey,
          fromTown: row.townLabel,
          toTownKey: option.townKey,
          toTown: option.townLabel,
          currentAssigned,
          reassigned,
          deltaBalance,
          netMissingDelta,
          estimatedBalanceAfterMove: Number(financials.totalBalance || 0) + deltaBalance,
          estimatedMissingAfterMove: Number(selectedScenario.totalWithoutSeat || 0) + netMissingDelta
        })
      })
    })

    return simulations
      .sort((a, b) => {
        if (a.deltaBalance !== b.deltaBalance) return b.deltaBalance - a.deltaBalance
        if (a.netMissingDelta !== b.netMissingDelta) return a.netMissingDelta - b.netMissingDelta
        return b.reassigned - a.reassigned
      })
      .slice(0, 6)
  }, [selectedScenario, financials, activeSheet, withoutSeatByTown, unitsForSimulation])

  React.useEffect(() => {
    if (!reassignmentSimulations.length) {
      setSimulationUnitId('')
      setSimulationTargetTownKey('')
      return
    }

    setSimulationUnitId(prev => prev || reassignmentSimulations[0].unitId)
    setSimulationTargetTownKey(prev => prev || reassignmentSimulations[0].toTownKey)
  }, [reassignmentSimulations])

  const selectedSimulationResult = React.useMemo(() => {
    if (!selectedScenario || !financials) return null
    if (!simulationUnitId || !simulationTargetTownKey) return null

    const baseRow = (financials.rows || []).find(row => row.unitId === simulationUnitId)
    if (!baseRow) return null

    const unit = unitByIdForSimulation.get(simulationUnitId)
    if (!unit) return null

    const option = unit.options.find(item => item.townKey === simulationTargetTownKey)
    if (!option) {
      return {
        valid: false,
        reason: 'Esa unidad no tiene ruta disponible hacia el pueblo elegido.'
      }
    }

    const shortage = withoutSeatByTown.find(item => item.townKey === simulationTargetTownKey)
    const neededAtTarget = Number(shortage?.withoutSeat || 0)
    if (neededAtTarget <= 0) {
      return {
        valid: false,
        reason: 'Ese pueblo no tiene faltantes actualmente.'
      }
    }

    const reassigned = Math.min(neededAtTarget, Number(option.capacity || 0))
    const newCostInfo = routeCostForPassengers(option, reassigned)
    const newPricePerPax = Number(activeSheet?.pricesByTown?.[option.townKey] ?? option.route.Precio_Por_Pasajero ?? 0)
    const newRevenue = newPricePerPax * reassigned
    const newBalance = newRevenue - newCostInfo.cost

    const currentAssigned = Number(baseRow.assigned || 0)
    const currentBalance = Number(baseRow.balance || 0)
    const deltaBalance = newBalance - currentBalance
    const netMissingDelta = currentAssigned - reassigned

    return {
      valid: true,
      unitLabel: `${baseRow.companyName} - ${baseRow.vehicleType} (${baseRow.unitId})`,
      fromTown: baseRow.townLabel,
      toTown: option.townLabel,
      currentAssigned,
      reassigned,
      deltaBalance,
      netMissingDelta,
      estimatedBalanceAfterMove: Number(financials.totalBalance || 0) + deltaBalance,
      estimatedMissingAfterMove: Number(selectedScenario.totalWithoutSeat || 0) + netMissingDelta
    }
  }, [selectedScenario, financials, simulationUnitId, simulationTargetTownKey, unitByIdForSimulation, withoutSeatByTown, activeSheet])

  const reboundOptionsByUnit = React.useMemo(() => {
    const optionsByUnit = new Map()
    if (!selectedScenario || !financials?.rows?.length || !withoutSeatByTown.length) return optionsByUnit

    ;(financials.rows || []).forEach(row => {
      const unit = unitByIdForSimulation.get(row.unitId)
      if (!unit) {
        optionsByUnit.set(row.unitId, [])
        return
      }

      const options = unit.options
        .filter(option => option.townKey !== row.townKey)
        .map(option => {
          const pending = Number(withoutSeatByTownMap.get(option.townKey) || 0)
          const capacity = Number(option.capacity || 0)
          const recoverableMax = Math.min(pending, capacity)
          return {
            townKey: option.townKey,
            townLabel: option.townLabel,
            pending,
            capacity,
            recoverableMax,
            delayMinutes: estimateReboundDelayMinutes(option.route)
          }
        })
        .filter(option => option.pending > 0 && option.capacity > 0)
        .sort((a, b) => {
          if (a.recoverableMax !== b.recoverableMax) return b.recoverableMax - a.recoverableMax
          return a.delayMinutes - b.delayMinutes
        })

      optionsByUnit.set(row.unitId, options)
    })

    return optionsByUnit
  }, [selectedScenario, financials, withoutSeatByTown, unitByIdForSimulation, withoutSeatByTownMap])

  React.useEffect(() => {
    if (!financials?.rows?.length) return

    setReboundSelectionByUnit(prev => {
      const next = {}
      ;(financials.rows || []).forEach(row => {
        const options = reboundOptionsByUnit.get(row.unitId) || []
        const prevSelection = prev[row.unitId] ?? activeSheet?.reboundSelectionByUnit?.[row.unitId]
        const keepPrevious = prevSelection !== undefined
        next[row.unitId] = keepPrevious ? prevSelection : (options[0]?.townKey || '')
      })
      return next
    })
  }, [financials, reboundOptionsByUnit, activeSheet])

  React.useEffect(() => {
    if (!financials?.rows?.length) return

    setReboundConfigByUnit(prev => {
      const next = {}
      ;(financials.rows || []).forEach(row => {
        const selectedTownKey = reboundSelectionByUnit[row.unitId]
        const selectedOption = (reboundOptionsByUnit.get(row.unitId) || []).find(option => option.townKey === selectedTownKey)
        const current = prev[row.unitId] ?? activeSheet?.reboundConfigByUnit?.[row.unitId] ?? {}
        next[row.unitId] = {
          enabled: Boolean(current.enabled),
          quotedCost: Number(current.quotedCost || 0),
          reboundPricePerPax: Number(current.reboundPricePerPax || 0)
        }
      })
      return next
    })
  }, [financials, reboundOptionsByUnit, reboundSelectionByUnit, activeSheet])

  const reboundPlan = React.useMemo(() => {
    if (!selectedScenario || !financials?.rows?.length || !withoutSeatByTown.length) {
      return {
        rows: [],
        totalRecoverable: 0,
        estimatedRemainingWithoutSeat: Number(selectedScenario?.totalWithoutSeat || 0),
        totalReboundCost: 0,
        totalReboundRevenue: 0,
        totalReboundBalance: 0,
        finalEstimatedBalance: Number(financials?.totalBalance || 0)
      }
    }

    const remainingByTown = new Map(
      withoutSeatByTown.map(item => [item.townKey, Number(item.withoutSeat || 0)])
    )

    const planRows = []

    ;(financials.rows || []).forEach(row => {
      const unit = unitByIdForSimulation.get(row.unitId)
      if (!unit) return

      const selectedTownKey = reboundSelectionByUnit[row.unitId]
      if (!selectedTownKey) return

      const config = reboundConfigByUnit[row.unitId] || {}
      if (!config.enabled) return

      const selectedOption = (reboundOptionsByUnit.get(row.unitId) || []).find(option => option.townKey === selectedTownKey)
      if (!selectedOption) return

      const pending = Number(remainingByTown.get(selectedOption.townKey) || 0)
      if (pending <= 0) return

      const recoverable = Math.min(pending, Number(selectedOption.capacity || 0))
      if (recoverable <= 0) return

      const quotedCost = Math.max(0, Number(config.quotedCost || 0))
      const reboundPricePerPax = Math.max(0, Number(config.reboundPricePerPax || 0))
      const reboundRevenue = reboundPricePerPax * recoverable
      const reboundBalance = reboundRevenue - quotedCost
      const freeSeats = Math.max(0, Number(selectedOption.capacity || 0) - recoverable)
      const freeSeatsOutbound = Math.floor(freeSeats / 2)
      const freeSeatsReturn = freeSeats - freeSeatsOutbound

      const picked = {
        groupNumber: row.groupNumber,
        groupLabel: row.groupLabel,
        unitId: row.unitId,
        companyId: row.companyId,
        routeId: reboundRouteId(activeSheet?.destinationCity, selectedOption.townKey, row.unitId),
        unitLabel: `${row.companyName} - ${row.vehicleType} (${row.unitId})`,
        companyName: row.companyName,
        vehicleType: row.vehicleType,
        currentTown: row.townLabel,
        targetTown: selectedOption.townLabel,
        targetTownKey: selectedOption.townKey,
        recoverable,
        quotedCost,
        reboundPricePerPax,
        reboundRevenue,
        reboundBalance,
        freeSeats,
        freeSeatsOutbound,
        freeSeatsReturn
      }

      remainingByTown.set(
        picked.targetTownKey,
        Math.max(0, Number(remainingByTown.get(picked.targetTownKey) || 0) - picked.recoverable)
      )

      planRows.push(picked)
    })

    const totalRecoverable = planRows.reduce((sum, item) => sum + Number(item.recoverable || 0), 0)
    const remainingBreakdown = Array.from(remainingByTown.entries())
      .map(([townKey, withoutSeat]) => ({ townKey, townName: townLabel(townKey), withoutSeat: Number(withoutSeat || 0) }))
      .filter(item => item.withoutSeat > 0)
      .sort((a, b) => b.withoutSeat - a.withoutSeat)

    const estimatedRemainingWithoutSeat = remainingBreakdown.reduce((sum, item) => sum + Number(item.withoutSeat || 0), 0)
    const totalReboundCost = planRows.reduce((sum, item) => sum + Number(item.quotedCost || 0), 0)
    const totalReboundRevenue = planRows.reduce((sum, item) => sum + Number(item.reboundRevenue || 0), 0)
    const totalReboundBalance = totalReboundRevenue - totalReboundCost
    const finalEstimatedBalance = Number(financials?.totalBalance || 0) + totalReboundBalance

    return {
      rows: planRows,
      totalRecoverable,
      estimatedRemainingWithoutSeat,
      remainingBreakdown,
      totalReboundCost,
      totalReboundRevenue,
      totalReboundBalance,
      finalEstimatedBalance
    }
  }, [selectedScenario, financials, withoutSeatByTown, reboundSelectionByUnit, reboundOptionsByUnit, reboundConfigByUnit, activeSheet])

  function updateActiveSheet(updater) {
    setSheets(prev => {
      const nextSheets = prev.map(sheet => {
        if (sheet.id !== activeSheetId) return sheet
        const updated = updater(sheet)
        return {
          ...updated,
          updatedAt: new Date().toISOString()
        }
      })
      writeSheetsToStorage(nextSheets)
      return nextSheets
    })
  }

  function updateReboundSelection(unitId, value) {
    const nextSelection = {
      ...(reboundSelectionByUnit || {}),
      [unitId]: value
    }
    setReboundSelectionByUnit(nextSelection)
    updateActiveSheet(sheet => ({
      ...sheet,
      reboundSelectionByUnit: nextSelection
    }))
  }

  function updateReboundConfig(unitId, patch) {
    const nextConfig = {
      ...(reboundConfigByUnit || {}),
      [unitId]: {
        ...((reboundConfigByUnit || {})[unitId] || {}),
        ...patch
      }
    }
    setReboundConfigByUnit(nextConfig)
    updateActiveSheet(sheet => ({
      ...sheet,
      reboundConfigByUnit: nextConfig
    }))
  }

  function saveActiveSheetDraft() {
    if (!activeSheet) return

    const nextSheets = sheets.map(sheet => {
      if (sheet.id !== activeSheetId) return sheet
      return {
        ...sheet,
        reboundSelectionByUnit: { ...(reboundSelectionByUnit || {}) },
        reboundConfigByUnit: { ...(reboundConfigByUnit || {}) },
        selectedScenarioId: selectedScenarioId || '',
        pricesByTown: { ...(sheet.pricesByTown || {}) },
        demandByTown: { ...(sheet.demandByTown || {}) },
        updatedAt: new Date().toISOString()
      }
    })

    setSheets(nextSheets)
    writeSheetsToStorage(nextSheets)
    saveRouteSheets(nextSheets).catch(() => {})

    alert('Hoja guardada.')
  }

  function selectScenarioAndPersist(scenarioId) {
    setSelectedScenarioId(scenarioId)
    updateActiveSheet(sheet => ({
      ...sheet,
      selectedScenarioId: scenarioId || ''
    }))
  }

  function setActiveField(field, value) {
    if (field === 'eventDate') {
      updateActiveSheet(sheet => ({ ...sheet, [field]: value }))
      setScenarios([])
      setSelectedScenarioId('')
      setComparisonSummary(null)
      return
    }
    updateActiveSheet(sheet => ({ ...sheet, [field]: value }))
  }

  function setDestination(value) {
    const validCompanyIds = availableCompanyIdsForDestination(rutas, vehiculos, empresas, value, activeSheet?.eventDate || '')
    updateActiveSheet(sheet => {
      const demandByTown = buildDemandForDestination(sheet, rutas, value)
      const pricesByTown = ensurePricesForDemand(sheet.pricesByTown || {}, rutas, value, demandByTown)
      const selectedCompanyIds = (sheet.selectedCompanyIds || []).filter(id => validCompanyIds.includes(id))
      return { ...sheet, destinationCity: value, cityLabel: value, demandByTown, pricesByTown, selectedCompanyIds }
    })
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function toggleCompany(companyId) {
    updateActiveSheet(sheet => {
      const current = Array.isArray(sheet.selectedCompanyIds) ? sheet.selectedCompanyIds : []
      const exists = current.includes(companyId)
      const next = exists ? current.filter(id => id !== companyId) : [...current, companyId]
      return { ...sheet, selectedCompanyIds: next }
    })
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function selectAllCompanies() {
    updateActiveSheet(sheet => ({ ...sheet, selectedCompanyIds: allCompaniesForSelection.map(company => company.ID_Empresa) }))
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function clearCompanyFilter() {
    updateActiveSheet(sheet => ({ ...sheet, selectedCompanyIds: [] }))
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function setDemand(origin, value) {
    const parsed = Number(value)
    const townKey = normalizeText(origin)
    updateActiveSheet(sheet => ({
      ...sheet,
      demandByTown: {
        ...sheet.demandByTown,
        [origin]: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
      },
      pricesByTown: {
        ...sheet.pricesByTown,
        [townKey]: Number(sheet.pricesByTown?.[townKey] || 0)
      }
    }))
    setComparisonSummary(null)
  }

  function setTownPrice(origin, value) {
    const townKey = normalizeText(origin)
    const parsed = Number(value)
    updateActiveSheet(sheet => ({
      ...sheet,
      pricesByTown: {
        ...sheet.pricesByTown,
        [townKey]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      }
    }))
    setComparisonSummary(null)
  }

  function addNewSheet() {
    const base = activeSheet
      ? {
          eventDate: activeSheet.eventDate,
          destinationCity: activeSheet.destinationCity,
          cityLabel: activeSheet.cityLabel,
          allowExcedente: activeSheet.allowExcedente,
          selectedCompanyIds: activeSheet.selectedCompanyIds || [],
          demandByTown: buildDemandForDestination({ demandByTown: {} }, rutas, activeSheet.destinationCity),
          pricingMode: 'suggested',
          customSeatPrice: ''
        }
      : null

    const created = createNewSheet(rutas, base)
    setSheets(prev => [created, ...prev])
    setActiveSheetId(created.id)
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function duplicateActiveSheet() {
    if (!activeSheet) return
    const cloned = createNewSheet(rutas, {
      ...activeSheet,
      eventName: activeSheet.eventName ? `${activeSheet.eventName} (copia)` : 'Evento (copia)',
      demandByTown: { ...activeSheet.demandByTown }
    })
    setSheets(prev => [cloned, ...prev])
    setActiveSheetId(cloned.id)
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function deleteSheet(id) {
    if (!window.confirm('Eliminar esta hoja de ruta?')) return

    setSheets(prev => {
      const next = prev.filter(item => item.id !== id)
      if (next.length === 0) {
        const created = createNewSheet(rutas)
        setActiveSheetId(created.id)
        return [created]
      }

      if (activeSheetId === id) {
        setActiveSheetId(next[0].id)
        setScenarios([])
        setSelectedScenarioId('')
        setComparisonSummary(null)
      }
      return next
    })
  }

  function clearDemand() {
    if (!activeSheet) return
    const nextDemand = origins.reduce((acc, origin) => {
      acc[origin] = 0
      return acc
    }, {})
    updateActiveSheet(sheet => ({ ...sheet, demandByTown: nextDemand }))
    setScenarios([])
    setSelectedScenarioId('')
    setComparisonSummary(null)
  }

  function calculateBestOptions(options = {}) {
    const silent = Boolean(options?.silent)
    const preferredScenarioId = options?.preferredScenarioId || activeSheet?.selectedScenarioId || ''
    if (!activeSheet) return

    if (!activeSheet.destinationCity) {
      if (!silent) alert('Indica la ciudad destino final antes de calcular.')
      return
    }

    const demandByTown = {}
    Object.entries(activeSheet.demandByTown || {}).forEach(([origin, value]) => {
      const passengers = Math.max(0, Number(value || 0))
      if (passengers <= 0) return
      demandByTown[normalizeText(origin)] = passengers
    })

    const totalDemand = Object.values(demandByTown).reduce((sum, val) => sum + Number(val || 0), 0)
    if (totalDemand <= 0) {
      if (!silent) alert('Carga pasajeros por pueblo para calcular.')
      return
    }

    const allAvailableCompanyIds = availableCompanyIdsForDestination(
      rutas,
      vehiculos,
      empresas,
      activeSheet.destinationCity,
      activeSheet.eventDate || ''
    )

    if (allAvailableCompanyIds.length === 0) {
      if (!silent) alert('No hay empresas con rutas disponibles para este destino.')
      setScenarios([])
      setSelectedScenarioId('')
      setComparisonSummary(null)
      return
    }

    const rawSelected = Array.isArray(activeSheet.selectedCompanyIds) ? activeSheet.selectedCompanyIds : []
    const selectedCompanies = rawSelected.length > 0
      ? rawSelected.filter(companyId => allAvailableCompanyIds.includes(companyId))
      : allAvailableCompanyIds

    const useExcedente = true
    const filteredUnits = buildUnitsForDestination(data, activeSheet.destinationCity, useExcedente, selectedCompanies)
    const best = optimizeScenarios(filteredUnits, demandByTown, 30)
    const strategic = buildRevenuePriorityScenario(filteredUnits, demandByTown, activeSheet?.pricesByTown || {})
    const mergedScenarios = strategic ? [...best, strategic] : best

    const allUnits = buildUnitsForDestination(data, activeSheet.destinationCity, useExcedente, allAvailableCompanyIds)
    const bestAll = optimizeScenarios(allUnits, demandByTown, 1)
    const topFiltered = best[0] || null
    const topAll = bestAll[0] || null
    const preferredScenario = mergedScenarios.find(item => item.id === preferredScenarioId) || null
    const selectedScenarioToUse = preferredScenario || mergedScenarios[0] || null
    const selectedScenarioToUseId = selectedScenarioToUse?.id || ''

    setScenarios(mergedScenarios)
    setSelectedScenarioId(selectedScenarioToUseId)
    setComparisonSummary(
      topFiltered && topAll
        ? {
            filtered: {
              cost: topFiltered.totalCost,
              assigned: topFiltered.totalAssigned,
              withoutSeat: topFiltered.totalWithoutSeat
            },
            all: {
              cost: topAll.totalCost,
              assigned: topAll.totalAssigned,
              withoutSeat: topAll.totalWithoutSeat
            },
            diffCost: topFiltered.totalCost - topAll.totalCost,
            diffAssigned: topFiltered.totalAssigned - topAll.totalAssigned,
            usingAllCompanies: rawSelected.length === 0
          }
        : null
    )

    updateActiveSheet(sheet => ({
      ...sheet,
      allowExcedente: true,
      selectedCompanyIds: rawSelected.filter(companyId => allAvailableCompanyIds.includes(companyId)),
      selectedScenarioId: selectedScenarioToUseId,
      lastCalculatedAt: new Date().toISOString(),
      lastSummary: {
        assigned: selectedScenarioToUse?.totalAssigned || 0,
        demand: selectedScenarioToUse?.totalDemand || 0,
        withoutSeat: selectedScenarioToUse?.totalWithoutSeat || 0,
        emptySeats: selectedScenarioToUse?.totalEmptySeats || 0,
        cost: selectedScenarioToUse?.totalCost || 0
      }
    }))
  }

  function buildOperationalReportText(companyId = '') {
    if (!activeSheet || !selectedScenario || !financials) return ''

    const filteredRows = (financials.rows || []).filter(row => !companyId || row.companyId === companyId)
    const title = companyId
      ? `SOMOS NOCHE TRANSPORTE - HOJA OPERATIVA POR EMPRESA ${allCompaniesForSelection.find(company => company.ID_Empresa === companyId)?.Nombre_Empresa || companyId}`
      : 'SOMOS NOCHE TRANSPORTE - HOJA OPERATIVA GENERAL'

    const header = [
      title,
      `Fecha: ${activeSheet.eventDate || 'Sin fecha'}`,
      `Evento: ${activeSheet.eventName || 'Sin nombre'}`,
      `Destino final: ${activeSheet.destinationCity || 'Sin destino'}`,
      `Pasajeros totales asignados: ${selectedScenario.totalAssigned}`,
      `Pasajeros sin lugar: ${selectedScenario.totalWithoutSeat}`,
      `Asientos vacios disponibles: ${selectedScenario.totalEmptySeats}`,
      `Ingreso total: ${formatCurrency(financials.totalRevenue)}`,
      `Costo total: ${formatCurrency(selectedScenario.totalCost)}`,
      `Balance total: ${formatCurrency(financials.totalBalance)}`,
      '',
      'DETALLE POR UNIDAD',
      'Grupo | Empresa | Unidad/Vehiculo | Punto de salida | Destino final | Pasajeros | Importe recaudado | Pago unidad | Balance unidad'
    ]

    const rows = filteredRows.map(row => (
      `${row.groupLabel || `Grupo ${row.groupNumber || '-'}`} | ${row.companyName} | ${row.unitId} (${row.vehicleType}) | ${row.townLabel} | ${row.destination} | ${row.assigned} | ${formatCurrency(row.revenue)} | ${formatCurrency(row.cost)} | ${formatCurrency(row.balance)}`
    ))

    return [...header, ...rows].join('\n')
  }

  function buildReboundReportText(companyId = '') {
    if (!activeSheet || !selectedScenario || !reboundPlan.rows.length) return ''

    const filteredRows = reboundPlan.rows.filter(row => !companyId || row.companyId === companyId)
    const title = companyId
      ? `SOMOS NOCHE TRANSPORTE - REBOTES POR EMPRESA ${allCompaniesForSelection.find(company => company.ID_Empresa === companyId)?.Nombre_Empresa || companyId}`
      : 'SOMOS NOCHE TRANSPORTE - REBOTES GENERALES'

    const header = [
      title,
      `Fecha: ${activeSheet.eventDate || 'Sin fecha'}`,
      `Evento: ${activeSheet.eventName || 'Sin nombre'}`,
      `Destino: ${activeSheet.destinationCity || 'Sin destino'}`,
      `Pasajeros recuperables estimados: ${reboundPlan.totalRecoverable}`,
      `Sin lugar estimado luego de rebotes: ${reboundPlan.estimatedRemainingWithoutSeat}`,
      `Costo total rebotes: ${formatCurrency(reboundPlan.totalReboundCost)}`,
      `Ingreso total rebotes: ${formatCurrency(reboundPlan.totalReboundRevenue)}`,
      `Resultado rebotes: ${formatCurrency(reboundPlan.totalReboundBalance)}`,
      `Balance final estimado (hoja + rebotes): ${formatCurrency(reboundPlan.finalEstimatedBalance)}`,
      '',
      'RUTAS REBOTE',
      'Grupo | Empresa | Unidad/Vehiculo | Rebate desde | Rebate hacia | Pax recuperables | Lugares libres | Costo rebote | Precio rebote/pax | Resultado'
    ]

    const rows = filteredRows.map(item => (
      `${item.groupLabel} | ${item.companyName} | ${item.vehicleType} | ${item.currentTown} | ${item.targetTown} | ${item.recoverable} | ${item.freeSeats} | ${formatCurrency(item.quotedCost)} | ${formatCurrency(item.reboundPricePerPax)} | ${formatCurrency(item.reboundBalance)}`
    ))

    return [...header, ...rows].join('\n')
  }

  function downloadTextFile(text, fileName) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  function copyOperationalReport(companyId = '') {
    const text = buildOperationalReportText(companyId)
    if (!text) {
      alert('Primero calcula una hoja para poder copiar el informe.')
      return
    }

    navigator.clipboard.writeText(text)
      .then(() => alert('Informe operativo copiado al portapapeles.'))
      .catch(() => alert('No se pudo copiar automaticamente.'))
  }

  function exportOperationalReport(companyId = '') {
    const text = buildOperationalReportText(companyId)
    if (!text) {
      alert('Primero calcula una hoja para poder exportar el informe.')
      return
    }

    const safeDate = String(activeSheet?.eventDate || 'sin-fecha').replace(/[^\d-]/g, '')
    const safeEvent = String(activeSheet?.eventName || 'evento').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'evento'
    const safeCompany = companyId ? String(allCompaniesForSelection.find(company => company.ID_Empresa === companyId)?.Nombre_Empresa || companyId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'general'
    downloadTextFile(text, `hoja-operativa-${safeDate}-${safeEvent}-${safeCompany}.txt`)
  }

  function copyReboundReport(companyId = '') {
    const text = buildReboundReportText(companyId)
    if (!text) {
      alert('Primero calcula una hoja para poder copiar los rebotes.')
      return
    }

    navigator.clipboard.writeText(text)
      .then(() => alert('Informe de rebotes copiado al portapapeles.'))
      .catch(() => alert('No se pudo copiar automaticamente.'))
  }

  function exportReboundReport(companyId = '') {
    const text = buildReboundReportText(companyId)
    if (!text) {
      alert('Primero calcula una hoja para poder exportar los rebotes.')
      return
    }

    const safeDate = String(activeSheet?.eventDate || 'sin-fecha').replace(/[^\d-]/g, '')
    const safeEvent = String(activeSheet?.eventName || 'evento').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'evento'
    const safeCompany = companyId ? String(allCompaniesForSelection.find(company => company.ID_Empresa === companyId)?.Nombre_Empresa || companyId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'general'
    downloadTextFile(text, `rebotes-${safeDate}-${safeEvent}-${safeCompany}.txt`)
  }

  function copyMissingByTown() {
    if (!withoutSeatByTown.length) {
      alert('No hay faltantes por pueblo para copiar.')
      return
    }

    const totalMissing = withoutSeatByTown.reduce((sum, item) => sum + Number(item.withoutSeat || 0), 0)
    const lines = [
      'SOMOS NOCHE TRANSPORTE - FALTANTES POR PUEBLO',
      `Fecha: ${activeSheet?.eventDate || 'Sin fecha'}`,
      `Evento: ${activeSheet?.eventName || 'Sin nombre'}`,
      `Destino: ${activeSheet?.destinationCity || 'Sin destino'}`,
      `Total sin lugar: ${totalMissing}`,
      '',
      'Detalle:'
    ]

    withoutSeatByTown.forEach(item => {
      lines.push(`${item.townName}: ${item.withoutSeat} sin lugar (asignados ${item.assigned}/${item.demand})`)
    })

    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => alert('Faltantes por pueblo copiados al portapapeles.'))
      .catch(() => alert('No se pudo copiar automaticamente.'))
  }

  function copyReboundPlan() {
    if (!reboundPlan.rows.length) {
      alert('No hay plan de rebotes sugerido para copiar.')
      return
    }

    const lines = [
      'SOMOS NOCHE TRANSPORTE - PLAN DE REBOTES',
      `Fecha: ${activeSheet?.eventDate || 'Sin fecha'}`,
      `Evento: ${activeSheet?.eventName || 'Sin nombre'}`,
      `Destino: ${activeSheet?.destinationCity || 'Sin destino'}`,
      `Pasajeros recuperables estimados: ${reboundPlan.totalRecoverable}`,
      `Sin lugar estimado luego de rebotes: ${reboundPlan.estimatedRemainingWithoutSeat}`,
      `Costo total rebotes: ${formatCurrency(reboundPlan.totalReboundCost)}`,
      `Ingreso total rebotes: ${formatCurrency(reboundPlan.totalReboundRevenue)}`,
      `Resultado rebotes: ${formatCurrency(reboundPlan.totalReboundBalance)}`,
      `Balance final estimado (hoja + rebotes): ${formatCurrency(reboundPlan.finalEstimatedBalance)}`,
      '',
      'Rutas rebote activas:'
    ]

    reboundPlan.rows.forEach(item => {
      lines.push(
        `${item.groupLabel} | ${item.companyName} | ${item.vehicleType} | ${item.routeId} | ` +
        `${activeSheet?.destinationCity || 'Evento'} -> ${item.targetTown} -> ${activeSheet?.destinationCity || 'Evento'} | ` +
        `Pax ${item.recoverable} | Libres ${item.freeSeats} | Costo ${formatCurrency(item.quotedCost)} | ` +
        `Precio/pax ${formatCurrency(item.reboundPricePerPax)} | Resultado ${formatCurrency(item.reboundBalance)}`
      )
      lines.push(`Mensaje operativo: ${item.groupLabel} rebota hacia ${item.targetTown} con ${item.freeSeats} lugares libres.`)
    })

    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => alert('Plan de rebotes copiado al portapapeles.'))
      .catch(() => alert('No se pudo copiar automaticamente.'))
  }

  function totalDemandForSheet(sheet) {
    return Object.values(sheet?.demandByTown || {}).reduce((sum, value) => sum + Number(value || 0), 0)
  }

  function townLabel(townKey) {
    const match = origins.find(origin => normalizeText(origin) === townKey)
    return match || townKey
  }

  if (!activeSheet) {
    return (
      <div className="general-quote">
        <h2>Reservas por pueblo</h2>
        <p>Cargando hojas de ruta...</p>
      </div>
    )
  }

  return (
    <div className="general-quote">
      <h2>Reservas por pueblo por hoja de ruta</h2>
      <div className="mobile-action-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" className="secondary" onClick={saveActiveSheetDraft}>Guardar hoja</button>
      </div>
      <p>
        Cada hoja guarda fecha, evento y destino final. Puedes manejar varios eventos al mismo tiempo y seguir cargando reservas sin perder historial.
      </p>

      <div className="section-grid">
        <div className="section-card">
          <div className="label">Destino activo</div>
          <div className="value">{activeSheet.destinationCity || 'Sin definir'}</div>
          <div className="hint">La hoja actual se calcula sobre este destino final.</div>
        </div>
        <div className="section-card">
          <div className="label">Pasajeros cargados</div>
          <div className="value">{totalDemandForSheet(activeSheet)}</div>
          <div className="hint">Reserva consolidada por pueblo y por evento.</div>
        </div>
        <div className="section-card">
          <div className="label">Empresas activas</div>
          <div className="value">{(activeSheet.selectedCompanyIds || []).length || 'Todas'}</div>
          <div className="hint">La selección actual se respeta al optimizar.</div>
        </div>
      </div>

      <section>
        <h3>Historial operativo</h3>
        <div className="mobile-action-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={addNewSheet}>Nueva hoja</button>
          <button onClick={duplicateActiveSheet}>Duplicar hoja actual</button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {sheets.map(sheet => (
            <div key={sheet.id} className={sheet.id === activeSheetId ? 'sheet-row-card sheet-row-card--active' : 'sheet-row-card'}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <strong>{sheet.eventDate || 'Sin fecha'} - {sheet.eventName || 'Evento sin nombre'}</strong>
                  <div className="subtle-quote">Destino: {sheet.destinationCity || 'Sin destino'}</div>
                  <div className="subtle-quote">Pasajeros cargados: {totalDemandForSheet(sheet)}</div>
                </div>
                <div className="mobile-action-row sheet-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => { setActiveSheetId(sheet.id) }}>
                    Abrir
                  </button>
                  <button onClick={() => deleteSheet(sheet.id)}>Eliminar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Datos del evento</h3>
        <div className="mobile-field-stack" style={{ display: 'grid', gap: 8 }}>
          <label className="mobile-field-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 160 }}>Fecha del evento</span>
            <input type="date" value={activeSheet.eventDate || ''} onChange={e => setActiveField('eventDate', e.target.value)} />
          </label>

          <label className="mobile-field-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 160 }}>Evento / referencia</span>
            <input type="text" value={activeSheet.eventName || ''} onChange={e => setActiveField('eventName', e.target.value)} placeholder="Ej: Isis Viernes" />
          </label>

          <label className="mobile-field-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 160 }}>Destino final</span>
            <input
              list="destination-list"
              value={activeSheet.destinationCity || ''}
              onChange={e => setDestination(e.target.value)}
              placeholder="Ej: Vicuña Mackenna"
            />
            <datalist id="destination-list">
              {destinationOptions.map(dest => <option key={dest} value={dest} />)}
            </datalist>
          </label>

          <div className="mobile-field-row mobile-field-row--top" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span className="mobile-field-label" style={{ minWidth: 160 }}>Empresas a considerar</span>
            <div className="mobile-field-body" style={{ display: 'grid', gap: 6 }}>
              <div className="mobile-action-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={clearCompanyFilter}>Sin filtro</button>
                <button type="button" onClick={selectAllCompanies}>Seleccionar todas</button>
              </div>
              {allCompaniesForSelection.length === 0 && (
                <span style={{ color: '#666' }}>No hay empresas cargadas.</span>
              )}
              {allCompaniesForSelection.map(company => {
                const checked = (activeSheet.selectedCompanyIds || []).includes(company.ID_Empresa)
                const available = activeSheet?.destinationCity ? availableCompanyIdsForCurrentDestination.has(company.ID_Empresa) : true
                return (
                  <label key={company.ID_Empresa} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: available ? 1 : 0.55 }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleCompany(company.ID_Empresa)} />
                    <span className={available ? 'status-chip' : 'attention-chip'}>{company.Nombre_Empresa} ({company.ID_Empresa}){available ? '' : ' - sin rutas para este destino'}</span>
                  </label>
                )
              })}
              <span className="subtle-quote">
                {(activeSheet.selectedCompanyIds || []).length === 0
                  ? 'Filtro activo: todas las empresas'
                  : `Filtro activo: ${(activeSheet.selectedCompanyIds || []).length} empresa(s)`}
              </span>
              {activeSheet?.destinationCity && availableCompanyIdsForCurrentDestination.size > 0 && (
                <span className="subtle-quote">
                  Disponibles para este destino: {availableCompanyIdsForCurrentDestination.size} de {allCompaniesForSelection.length}
                </span>
              )}
            </div>
          </div>

          <label className="mobile-field-row mobile-checkbox-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={true}
              readOnly
            />
            Contemplar excedente siempre (activo)
          </label>
          <p className="subtle-quote">El cálculo usa asientos + excedente permitido por cada traffic y marca cuándo se opera excedido.</p>
        </div>
      </section>

      <section>
        <h3>Reservas por pueblo para {activeSheet.destinationCity || 'destino sin definir'}</h3>
        {origins.length === 0 && <p>No hay rutas cargadas para este destino final.</p>}
        {origins.length > 0 && (
          <div className="reservation-entry-list" style={{ display: 'grid', gap: 8 }}>
            <div className="reservation-entry-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 120px 150px', gap: 8, alignItems: 'center', fontWeight: 700 }}>
              <span>Pueblo</span>
              <span style={{ textAlign: 'right' }}>Reservas</span>
              <span style={{ textAlign: 'right' }}>Precio cobrado</span>
            </div>
            {origins.map(origin => (
              <label className="reservation-entry-row" key={origin} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 120px 150px', gap: 8, alignItems: 'center' }}>
                <span className="reservation-town">{origin}</span>
                <input
                  type="number"
                  min="0"
                  value={inputNumberOrBlank(activeSheet.demandByTown?.[origin] ?? '')}
                  onChange={e => setDemand(origin, e.target.value)}
                  style={{ textAlign: 'right' }}
                />
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={inputNumberOrBlank(activeSheet.pricesByTown?.[normalizeText(origin)] ?? '')}
                  onChange={e => setTownPrice(origin, e.target.value)}
                  style={{ textAlign: 'right' }}
                />
              </label>
            ))}
          </div>
        )}

        <div className="mobile-action-row" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={calculateBestOptions}>Calcular mejores opciones</button>
          <button onClick={clearDemand}>Limpiar pasajeros de esta hoja</button>
          <button type="button" className="secondary" onClick={saveActiveSheetDraft}>Guardar hoja</button>
        </div>

        {activeSheet.lastCalculatedAt && (
          <p style={{ marginTop: 8, color: '#666' }}>
            Ultimo calculo: {new Date(activeSheet.lastCalculatedAt).toLocaleString('es-AR')}
          </p>
        )}
      </section>

      {recommendations.length > 0 && (
          <section>
            <h3>Opciones sugeridas</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {recommendations.map(option => {
              const totalWithoutSeat = Number(option.scenario.totalWithoutSeat || 0)
              const totalDemand = Number(option.scenario.totalDemand || 0)
              const missingRatio = totalDemand > 0 ? (totalWithoutSeat / totalDemand) : 0
              const trafficStatus = totalWithoutSeat === 0
                ? 'ok'
                : (missingRatio <= 0.12 ? 'warning' : 'critical')

              const trafficStatusLabel = trafficStatus === 'ok'
                ? 'Verde (sin faltantes)'
                : (trafficStatus === 'warning' ? 'Amarillo (faltantes moderados)' : 'Rojo (faltantes altos)')

              const tone = trafficStatus === 'ok'
                ? { border: '#1e8e3e', bgA: '#f3fff6', bgB: '#ffffff', text: '#1e8e3e' }
                : (trafficStatus === 'warning'
                  ? { border: '#b26a00', bgA: '#fff8ec', bgB: '#ffffff', text: '#8a4f00' }
                  : { border: '#b42318', bgA: '#fff5f5', bgB: '#ffffff', text: '#9b1c1c' })

              const selected = selectedScenario?.id === option.scenario.id
              const withoutSeatDetail = (option.scenario.breakdown || [])
                .filter(item => Number(item.withoutSeat || 0) > 0)
                .sort((a, b) => Number(b.withoutSeat || 0) - Number(a.withoutSeat || 0))
                .map(item => `${townLabel(item.townKey)} ${item.withoutSeat}`)

              const coveredTowns = (option.scenario.breakdown || [])
                .filter(item => Number(item.demand || 0) > 0 && Number(item.withoutSeat || 0) <= 0)
                .map(item => townLabel(item.townKey))

              const assignedTownCounts = Array.from(
                (option.financials.rows || []).reduce((acc, row) => {
                  const key = row.townKey
                  if (!acc.has(key)) {
                    acc.set(key, { townKey: key, townName: townLabel(key), units: 0, assigned: 0 })
                  }
                  const current = acc.get(key)
                  current.units += 1
                  current.assigned += Number(row.assigned || 0)
                  return acc
                }, new Map()).values()
              )
                .sort((a, b) => b.assigned - a.assigned)
                .map(item => `${item.townName}: ${item.assigned} pax (${item.units} traffic)`)

              const extraByTown = Array.from(
                (option.financials.rows || []).reduce((acc, row) => {
                  const used = Number(row.extraUsed || 0)
                  if (used <= 0) return acc
                  const key = row.townKey
                  if (!acc.has(key)) {
                    acc.set(key, { townName: townLabel(key), extraUsed: 0 })
                  }
                  acc.get(key).extraUsed += used
                  return acc
                }, new Map()).values()
              )
                .sort((a, b) => b.extraUsed - a.extraUsed)
                .map(item => `${item.townName} ${item.extraUsed}`)

              return (
                <button
                  key={option.id}
                  onClick={() => selectScenarioAndPersist(option.scenario.id)}
                  style={{
                    textAlign: 'left',
                    border: selected ? `2px solid ${tone.border}` : `1px solid ${tone.border}`,
                    borderRadius: 8,
                    padding: 8,
                    background: selected
                      ? `linear-gradient(180deg, ${tone.bgA}, ${tone.bgB})`
                      : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <strong>{option.title}</strong>
                  <div style={{ color: tone.text, fontWeight: 700 }}>Semaforo operativo: {trafficStatusLabel}</div>
                  <div className="subtle-quote">{option.description}</div>
                  <div>Asignados: {option.scenario.totalAssigned}/{option.scenario.totalDemand}</div>
                  <div>Costo: {formatCurrency(option.scenario.totalCost)} | Ingreso: {formatCurrency(option.financials.totalRevenue)}</div>
                  <div>Resultado final: <strong className={option.financials.totalBalance < 0 ? 'metric-negative' : 'metric-positive'}>{formatCurrency(option.financials.totalBalance)}</strong></div>
                  <div>Sin lugar: <span className={option.scenario.totalWithoutSeat > 0 ? 'metric-warning' : 'metric-positive'}>{option.scenario.totalWithoutSeat}</span> | Lugares vacíos: <span className={option.scenario.totalEmptySeats > 0 ? 'attention-chip' : 'status-chip'}>{option.scenario.totalEmptySeats}</span></div>
                  <div className="subtle-quote">Sin lugar por pueblo: {withoutSeatDetail.length ? withoutSeatDetail.join(' | ') : 'Sin faltantes.'}</div>
                  <div className="subtle-quote">Pueblos cubiertos al 100%: {coveredTowns.length ? coveredTowns.join(' | ') : 'Ninguno.'}</div>
                  <div className="subtle-quote">Asignaciones por pueblo: {assignedTownCounts.length ? assignedTownCounts.join(' | ') : 'Sin asignaciones.'}</div>
                  <div className="subtle-quote">Operando con excedente en: {extraByTown.length ? extraByTown.join(' | ') : 'No se usa excedente.'}</div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {selectedScenario && (
        <section>
          <h3>Detalle de la hoja de ruta</h3>
          <p>
            Fecha: <strong>{activeSheet.eventDate || 'Sin fecha'}</strong> |
            Evento: <strong> {activeSheet.eventName || 'Sin nombre'} </strong>|
            Destino: <strong> {activeSheet.destinationCity || 'Sin destino'}</strong>
          </p>

          <h4>Estado por pueblo</h4>
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Pueblo</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Demanda</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Asignados</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Sin lugar</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Vacíos</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Precio</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Ingreso</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Costo</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {(financials?.townRows || []).map(item => {
                return (
                  <tr key={item.townKey}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{townLabel(item.townKey)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(item.demand)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(item.assigned)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                      <span className={item.withoutSeat > 0 ? 'metric-warning' : 'status-chip'}>{displayNumber(item.withoutSeat)}</span>
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(item.emptySeats)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayCurrency(item.pricePerPax)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayCurrency(item.revenue)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayCurrency(item.cost)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                      <span className={item.balance < 0 ? 'metric-negative' : 'metric-positive'}>{displayCurrency(item.balance)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {withoutSeatByTown.length > 0 && (
            <div className="section-card" style={{ marginBottom: 10 }}>
              <div className="label">Pasajeros sin lugar por pueblo</div>
              <div className="value">
                <span className="metric-warning">Total sin lugar: {displayNumber(withoutSeatByTown.reduce((sum, item) => sum + item.withoutSeat, 0))}</span>
              </div>
              <div className="report-actions" style={{ marginTop: 8, marginBottom: 4 }}>
                <button type="button" onClick={copyMissingByTown}>Copiar faltantes por pueblo</button>
              </div>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {withoutSeatByTown.map(item => (
                  <div key={`without-${item.townKey}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{item.townName}</strong>
                    <span className="attention-chip">{item.withoutSeat} sin lugar</span>
                    <span className="subtle-quote">Asignados: {item.assigned} de {item.demand}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedScenario && (
            <>
              <h4>Simulación de reasignación (1 traffic)</h4>
              <p className="subtle-quote">Ahora podes elegir manualmente qué unidad mover y a qué pueblo con faltantes para ver el impacto antes de decidir.</p>

              {reassignmentSimulations.length > 0 && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 190 }}>Unidad a mover</span>
                    <select value={simulationUnitId} onChange={e => setSimulationUnitId(e.target.value)}>
                      {(financials?.rows || []).map(row => (
                        <option key={`sim-unit-${row.unitId}-${row.routeId}`} value={row.unitId}>
                          {row.companyName} - {row.vehicleType} ({row.unitId}) - hoy en {row.townLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 190 }}>Pueblo destino de la unidad</span>
                    <select value={simulationTargetTownKey} onChange={e => setSimulationTargetTownKey(e.target.value)}>
                      {withoutSeatByTown.map(item => (
                        <option key={`sim-target-${item.townKey}`} value={item.townKey}>
                          {item.townName} ({item.withoutSeat} sin lugar)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {!reassignmentSimulations.length && (
                <p className="subtle-quote">No hay una reasignación útil detectada para este escenario actual.</p>
              )}

              {selectedSimulationResult && !selectedSimulationResult.valid && (
                <div className="attention-chip" style={{ marginBottom: 10 }}>{selectedSimulationResult.reason}</div>
              )}

              {selectedSimulationResult && selectedSimulationResult.valid && (
                <div className="section-card" style={{ marginBottom: 10 }}>
                  <div className="label">Resultado estimado de tu selección</div>
                  <p><strong>Movimiento:</strong> {selectedSimulationResult.unitLabel} desde {selectedSimulationResult.fromTown} hacia {selectedSimulationResult.toTown}.</p>
                  <p><strong>Pasajeros actuales de esa unidad:</strong> {displayNumber(selectedSimulationResult.currentAssigned)}.</p>
                  <p><strong>Pasajeros que cubriría en destino:</strong> {displayNumber(selectedSimulationResult.reassigned)}.</p>
                  <p><strong>Impacto en balance:</strong> <span className={selectedSimulationResult.deltaBalance >= 0 ? 'metric-positive' : 'metric-negative'}>{selectedSimulationResult.deltaBalance >= 0 ? '+' : ''}{displayCurrency(selectedSimulationResult.deltaBalance)}</span></p>
                  <p><strong>Cambio neto de faltantes:</strong> <span className={selectedSimulationResult.netMissingDelta <= 0 ? 'metric-positive' : 'metric-warning'}>{selectedSimulationResult.netMissingDelta > 0 ? '+' : ''}{displayNumber(selectedSimulationResult.netMissingDelta)}</span></p>
                  <p><strong>Balance estimado final:</strong> <span className={selectedSimulationResult.estimatedBalanceAfterMove >= 0 ? 'metric-positive' : 'metric-negative'}>{displayCurrency(selectedSimulationResult.estimatedBalanceAfterMove)}</span></p>
                  <p><strong>Pasajeros sin lugar estimados:</strong> <span className={selectedSimulationResult.estimatedMissingAfterMove > 0 ? 'metric-warning' : 'metric-positive'}>{displayNumber(selectedSimulationResult.estimatedMissingAfterMove)}</span></p>
                </div>
              )}

              {reassignmentSimulations.length > 0 && (
                <p className="subtle-quote">Sugerencias automáticas adicionales (ordenadas por mayor impacto en balance):</p>
              )}

              {reassignmentSimulations.length > 0 && (
                <div className="table-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, minWidth: 1160 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Unidad</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Movimiento simulado</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Pax actuales</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Pax en destino</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Impacto balance</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Faltantes netos</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Balance estimado</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Sin lugar estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reassignmentSimulations.map((sim, index) => (
                        <tr key={`sim-${sim.unitId}-${sim.toTownKey}-${index}`} className={index === 0 ? 'highlight-row' : ''} onClick={() => { setSimulationUnitId(sim.unitId); setSimulationTargetTownKey(sim.toTownKey) }} style={{ cursor: 'pointer' }}>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{sim.companyName} - {sim.vehicleType} ({sim.unitId})</td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                            {sim.fromTown} a {sim.toTown}
                          </td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(sim.currentAssigned)}</td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(sim.reassigned)}</td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                            <span className={sim.deltaBalance >= 0 ? 'metric-positive' : 'metric-negative'}>
                              {sim.deltaBalance >= 0 ? '+' : ''}{displayCurrency(sim.deltaBalance)}
                            </span>
                          </td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                            <span className={sim.netMissingDelta <= 0 ? 'metric-positive' : 'metric-warning'}>
                              {sim.netMissingDelta > 0 ? '+' : ''}{displayNumber(sim.netMissingDelta)}
                            </span>
                          </td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                            <span className={sim.estimatedBalanceAfterMove >= 0 ? 'metric-positive' : 'metric-negative'}>
                              {displayCurrency(sim.estimatedBalanceAfterMove)}
                            </span>
                          </td>
                          <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                            <span className={sim.estimatedMissingAfterMove > 0 ? 'metric-warning' : 'metric-positive'}>
                              {displayNumber(sim.estimatedMissingAfterMove)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4>Plan de rebotes (segunda vuelta)</h4>
                  <p className="subtle-quote">Cargalo por empresa/unidad: activas rebote, elegis pueblo objetivo y completás costo y precio. Se guarda en la hoja para no perderlo al volver.</p>
              <div className="report-actions" style={{ marginTop: 6, marginBottom: 6 }}>
                    <button type="button" onClick={() => copyReboundReport()}>Copiar plan de rebotes general</button>
                    <button type="button" className="secondary" onClick={() => exportReboundReport()}>Exportar rebotes general (.txt)</button>
              </div>
              {(financials?.rows || []).length > 0 && (
                <>
                  <p>
                    Recuperables estimados por rebote: <strong className="metric-positive">{displayNumber(reboundPlan.totalRecoverable)}</strong> |
                    Sin lugar estimado luego de rebotes: <strong className={reboundPlan.estimatedRemainingWithoutSeat > 0 ? 'metric-warning' : 'metric-positive'}>{displayNumber(reboundPlan.estimatedRemainingWithoutSeat)}</strong>
                  </p>
                  {reboundPlan.remainingBreakdown.length > 0 && (
                    <p className="subtle-quote">
                      Restantes por pueblo luego del rebote: {reboundPlan.remainingBreakdown.map(item => `${item.townName} ${displayNumber(item.withoutSeat)}`).join(' | ')}
                    </p>
                  )}
                  <p>
                    Costo rebotes: <strong>{displayCurrency(reboundPlan.totalReboundCost)}</strong> |
                    Ingreso rebotes: <strong>{displayCurrency(reboundPlan.totalReboundRevenue)}</strong> |
                    Resultado rebotes: <strong className={reboundPlan.totalReboundBalance >= 0 ? 'metric-positive' : 'metric-negative'}>{displayCurrency(reboundPlan.totalReboundBalance)}</strong> |
                    Balance final estimado: <strong className={reboundPlan.finalEstimatedBalance >= 0 ? 'metric-positive' : 'metric-negative'}>{displayCurrency(reboundPlan.finalEstimatedBalance)}</strong>
                  </p>
                      <p className="subtle-quote">Este cálculo ya descuenta los pasajeros recuperados: si faltaban 19 y reboteás 13, quedan 6 sin lugar.</p>
                  <div className="table-scroll">
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, minWidth: 1560 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'center', borderBottom: '1px solid #ddd', padding: 6 }}>Activar</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Grupo</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Unidad</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Viaje 1 (origen)</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Ruta rebote</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Rebote (editable)</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Pax recuperables</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Lugares libres rebote</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Costo rebote</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Precio rebote/pax</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Resultado rebote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(financials?.rows || []).map(row => {
                          const options = reboundOptionsByUnit.get(row.unitId) || []
                          const selectedTownKey = reboundSelectionByUnit[row.unitId] || ''
                          const planRow = reboundPlan.rows.find(item => item.unitId === row.unitId)
                          const reboundConfig = reboundConfigByUnit[row.unitId] || {}
                          const estimatedRouteId = reboundRouteId(activeSheet?.destinationCity, selectedTownKey || 'PEND', row.unitId)
                          return (
                            <tr key={`rebound-edit-${row.unitId}-${row.routeId}`}>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(reboundConfig.enabled)}
                                  onChange={e => updateReboundConfig(row.unitId, { enabled: e.target.checked })}
                                />
                              </td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6 }}><span className="status-chip">{row.groupLabel}</span></td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.companyName} - {row.vehicleType} ({row.unitId})</td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.townLabel} a {row.destination}</td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{estimatedRouteId}</td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                                <select
                                  value={selectedTownKey}
                                  onChange={e => updateReboundSelection(row.unitId, e.target.value)}
                                >
                                  <option value="">Sin rebote</option>
                                  {options.map(option => (
                                    <option key={`rebound-opt-${row.unitId}-${option.townKey}`} value={option.townKey}>
                                      {option.townLabel} ({option.pending} sin lugar, {Math.max(0, option.capacity - Math.min(option.pending, option.capacity))} libres)
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{planRow?.recoverable || 0}</td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                                {planRow ? `${displayNumber(planRow.freeSeats)} (${displayNumber(planRow.freeSeatsOutbound)} y ${displayNumber(planRow.freeSeatsReturn)})` : ''}
                              </td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="1000"
                                  value={inputNumberOrBlank(reboundConfig.quotedCost ?? '')}
                                  onChange={e => updateReboundConfig(row.unitId, { quotedCost: Math.max(0, Number(e.target.value || 0)) })}
                                  style={{ width: 120, textAlign: 'right' }}
                                />
                              </td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="1000"
                                  value={inputNumberOrBlank(reboundConfig.reboundPricePerPax ?? '')}
                                  onChange={e => updateReboundConfig(row.unitId, { reboundPricePerPax: Math.max(0, Number(e.target.value || 0)) })}
                                  style={{ width: 120, textAlign: 'right' }}
                                />
                              </td>
                              <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                                <span className={(planRow?.reboundBalance || 0) >= 0 ? 'metric-positive' : 'metric-negative'}>
                                  {displayCurrency(planRow?.reboundBalance || 0)}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="subtle-quote">Ruta rebote base: {activeSheet.destinationCity || 'Evento'} {'->'} Pueblo faltante {'->'} {activeSheet.destinationCity || 'Evento'}.</p>
                </>
              )}
            </>
          )}

          <h4>Transportes asignados y balance</h4>
          <div className="subtle-quote" style={{ marginBottom: 6 }}>Exporta una versión general para coordinación o una por empresa para pasarlo a cada chofer.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Empresa para exportar</span>
              <select value={reportCompanyId} onChange={e => setReportCompanyId(e.target.value)}>
                <option value="">General / coordinador</option>
                {allCompaniesForSelection.map(company => (
                  <option key={`report-company-${company.ID_Empresa}`} value={company.ID_Empresa}>{company.Nombre_Empresa}</option>
                ))}
              </select>
            </label>
              <button type="button" className="secondary" onClick={saveActiveSheetDraft}>Guardar hoja</button>
          </div>
          <div className="report-actions">
            <button type="button" onClick={() => copyOperationalReport()}>Copiar hoja general</button>
            <button type="button" className="secondary" onClick={() => exportOperationalReport()}>Exportar hoja general (.txt)</button>
            <button type="button" onClick={() => copyOperationalReport(reportCompanyId)}>Copiar por empresa</button>
            <button type="button" className="secondary" onClick={() => exportOperationalReport(reportCompanyId)}>Exportar por empresa (.txt)</button>
            <button type="button" onClick={() => copyReboundReport(reportCompanyId)}>Copiar rebotes por empresa</button>
            <button type="button" className="secondary" onClick={() => exportReboundReport(reportCompanyId)}>Exportar rebotes por empresa (.txt)</button>
          </div>
          {financials && financials.rows.length === 0 && <p>No hay asignaciones para la demanda actual.</p>}

          {financials && financials.rows.length > 0 && (
            <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, minWidth: 1320 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Grupo</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Empresa / Unidad</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Ruta</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Asientos</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Excedente permitido</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Pax</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Excedente usado</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Excedente libre</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Vacíos</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Estado</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Costo</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Ingreso</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {financials.rows.map(row => {
                  const extraFree = Math.max(0, Number(row.extraAllowed || 0) - Number(row.extraUsed || 0))
                  const usingExtra = Number(row.extraUsed || 0) > 0
                  return (
                  <tr key={`${row.unitId}-${row.routeId}`} className={usingExtra ? 'highlight-row' : ''}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}><span className="status-chip">{row.groupLabel || `Grupo ${row.groupNumber || '-'}`}</span></td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.companyName} - {row.vehicleType} ({row.unitId})</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.townLabel} a {row.destination}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{row.seats}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{row.extraAllowed}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{row.assigned}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                      <span className={usingExtra ? 'attention-chip' : 'status-chip'}>{row.extraUsed}</span>
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                      <span className={extraFree > 0 ? 'metric-positive' : 'status-chip'}>{extraFree}</span>
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{row.emptySeats}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                      {usingExtra ? <span className="attention-chip">Operando con excedente</span> : <span className="status-chip">Dentro de asientos</span>}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatCurrency(row.cost)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{formatCurrency(row.revenue)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                      <span className={row.balance < 0 ? 'metric-negative' : 'metric-positive'}>{formatCurrency(row.balance)}</span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            </div>
          )}

          {availabilityByUnit.length > 0 && (
            <>
              <h4>Resumen de lugares disponibles por traffic</h4>
              <p className="subtle-quote">Sirve para juntar lugares libres y evitar sacar otra unidad con costo alto.</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span>Mostrar solo con mínimo de lugares libres</span>
                <input
                  type="number"
                  min="0"
                  value={minFreeSeats}
                  onChange={e => setMinFreeSeats(Math.max(0, Number(e.target.value || 0)))}
                  style={{ width: 110, textAlign: 'right' }}
                />
              </label>
              <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, minWidth: 1020 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Traffic / empresa</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Pueblo</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Asientos</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Excedente</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Libres en asientos</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Libres en excedente</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 6 }}>Total libre</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {availabilityByUnit.filter(row => Number(row.totalAvailable || 0) >= Number(minFreeSeats || 0)).map(row => (
                    <tr key={`avail-${row.unitId}-${row.routeId}`} className={row.usingExtra ? 'highlight-row' : ''}>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.companyName} - {row.vehicleType} ({row.unitId})</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.townLabel}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(row.seats)}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{displayNumber(row.extraAllowed)}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{row.baseAvailable}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>{row.extraAvailable}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6, textAlign: 'right' }}>
                        <span className={row.totalAvailable > 0 ? 'metric-positive' : 'status-chip'}>{row.totalAvailable}</span>
                      </td>
                      <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                        {row.usingExtra ? <span className="attention-chip">Con excedente usado</span> : <span className="status-chip">Disponible</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          {financials && (
            <div>
              <div className="section-grid" style={{ marginTop: 6 }}>
                <div className="section-card">
                  <div className="label">Costo total</div>
                  <div className="value">{displayCurrency(selectedScenario.totalCost)}</div>
                  <div className="hint">Costo operativo consolidado.</div>
                </div>
                <div className="section-card">
                  <div className="label">Ingreso total</div>
                  <div className="value">{displayCurrency(financials.totalRevenue)}</div>
                  <div className="hint">Ingreso esperado por reservas cargadas.</div>
                </div>
                <div className="section-card">
                  <div className="label">Balance total</div>
                  <div className="value">
                      <span className={reboundPlan.finalEstimatedBalance < 0 ? 'metric-negative' : 'metric-positive'}>{displayCurrency(reboundPlan.finalEstimatedBalance)}</span>
                  </div>
                    <div className="hint">Resultado final de la hoja activa con rebotes descontados.</div>
                </div>
              </div>

                <p>
                  Balance total con rebotes: <strong className={reboundPlan.finalEstimatedBalance < 0 ? 'metric-negative' : 'metric-positive'}>{displayCurrency(reboundPlan.finalEstimatedBalance)}</strong>
                </p>
              <p>Pasajeros sin lugar: <strong className={Number(reboundPlan.estimatedRemainingWithoutSeat || 0) > 0 ? 'metric-warning' : 'metric-positive'}>{displayNumber(reboundPlan.estimatedRemainingWithoutSeat)}</strong></p>
              <p>Asientos vacíos disponibles: <strong className={selectedScenario.totalEmptySeats > 0 ? 'attention-chip' : 'status-chip'}>{displayNumber(selectedScenario.totalEmptySeats)}</strong></p>
            </div>
          )}
        </section>
      )}

      {selectedScenario && selectedScenario.breakdown.some(item => item.withoutSeat > 0) && (
        <div className="attention-chip">
          Quedaron pasajeros sin lugar. Puedes mantener esta hoja guardada y seguir cargando reservas a medida que entren.
        </div>
      )}
    </div>
  )
}
