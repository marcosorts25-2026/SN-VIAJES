import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initializeApp, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

dotenv.config()

const required = ['MP_ACCESS_TOKEN', 'FIREBASE_PROJECT_ID', 'FIREBASE_DATABASE_URL', 'FIREBASE_SERVICE_ACCOUNT_JSON']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`)
  }
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
})

const db = getDatabase()
const app = express()

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer
  },
}))

const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('Origin not allowed'))
  },
}))

const MP_API = 'https://api.mercadopago.com'
const MP_SOURCE_TAG = (process.env.MP_SOURCE_TAG ?? 'SNTAPP').trim()
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL ?? '').trim().replace(/\/$/, '')
const MP_STATEMENT_DESCRIPTOR = (process.env.MP_STATEMENT_DESCRIPTOR ?? 'SOMOSNOCHE').trim().slice(0, 13)

const getBearer = () => `Bearer ${process.env.MP_ACCESS_TOKEN}`

const normalizeReservationId = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const parsePositiveInt = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

const isAllowedStatus = (status) =>
  status === 'approved' || status === 'authorized'

const isValidWebhookSignature = (rawBody, signatureHeader) => {
  const secret = (process.env.MP_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return true
  }

  if (!rawBody || !signatureHeader) {
    return false
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const normalized = String(signatureHeader).trim()
  const parts = normalized.split(',').map((part) => part.trim())
  const v1Part = parts.find((part) => part.toLowerCase().startsWith('v1='))
  const candidate = (v1Part ? v1Part.slice(3).trim() : normalized).toLowerCase()

  if (!/^[a-f0-9]{64}$/.test(candidate)) {
    return false
  }

  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(candidate, 'utf8')
  if (a.length !== b.length) {
    return false
  }

  return crypto.timingSafeEqual(a, b)
}

const buildSafeItemTitle = (reservation, eventId) => {
  const eventName = typeof reservation.eventName === 'string' && reservation.eventName.trim()
    ? reservation.eventName.trim()
    : `Evento ${eventId}`
  const batchLabel = typeof reservation.entryBatchLabel === 'string' && reservation.entryBatchLabel.trim()
    ? reservation.entryBatchLabel.trim()
    : 'Entrada anticipada'
  return `${eventName} - ${batchLabel}`
}

const fetchPayment = async (paymentId) => {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: getBearer(),
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP payment fetch failed: ${res.status} ${text}`)
  }
  return await res.json()
}

const upsertPaymentAudit = async (paymentId, payload) => {
  await db.ref(`mpPayments/${paymentId}`).update({
    ...payload,
    updatedAt: Date.now(),
  })
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'somosnoche-mp-gateway' })
})

app.post('/api/mercadopago/create-preference', async (req, res) => {
  try {
    const reservationId = normalizeReservationId(req.body?.reservationId)
    const sourceApp = typeof req.body?.sourceApp === 'string' ? req.body.sourceApp.trim() : 'somosnoche_venta_pass'

    if (!reservationId) {
      res.status(400).json({ ok: false, message: 'Invalid reservation id.' })
      return
    }

    const reservationSnap = await db.ref(`reservations/${reservationId}`).get()
    if (!reservationSnap.exists()) {
      res.status(404).json({ ok: false, message: 'Reservation not found.' })
      return
    }

    const reservation = reservationSnap.val() ?? {}
    const eventId = typeof reservation.eventId === 'string' ? reservation.eventId.trim() : ''
    const buyerEmail = typeof reservation.email === 'string'
      ? reservation.email.trim().toLowerCase()
      : typeof reservation.buyerEmail === 'string'
        ? reservation.buyerEmail.trim().toLowerCase()
        : ''
    const quantity = parsePositiveInt(reservation.quantity) ??
      (Array.isArray(reservation.passengers) ? reservation.passengers.length : null)
    const unitPrice = parsePositiveInt(reservation.unitPrice) ?? parsePositiveInt(reservation.listPrice)

    if (!eventId || !buyerEmail || !quantity || !unitPrice) {
      res.status(422).json({ ok: false, message: 'Reservation is missing secure payment data.' })
      return
    }

    const itemTitle = buildSafeItemTitle(reservation, eventId)

    const externalReference = `${MP_SOURCE_TAG}:${reservationId}`
    const idempotencyKey = `pref-${reservationId}`

    const preferencePayload = {
      items: [
        {
          title: itemTitle,
          quantity,
          unit_price: unitPrice,
          currency_id: 'ARS',
        },
      ],
      payer: {
        email: buyerEmail,
      },
      metadata: {
        reservationId,
        eventId,
        sourceApp,
        sourceTag: MP_SOURCE_TAG,
        purchaseMode: typeof reservation.purchaseMode === 'string' ? reservation.purchaseMode : null,
        ticketType: typeof reservation.ticketType === 'string' ? reservation.ticketType : null,
        entryBatchId: typeof reservation.entryBatchId === 'string' ? reservation.entryBatchId : null,
        entryBatchLabel: typeof reservation.entryBatchLabel === 'string' ? reservation.entryBatchLabel : null,
      },
      external_reference: externalReference,
      statement_descriptor: MP_STATEMENT_DESCRIPTOR,
      back_urls: FRONTEND_BASE_URL
        ? {
            success: `${FRONTEND_BASE_URL}/?public=entry&payment=success&reservationId=${encodeURIComponent(reservationId)}`,
            pending: `${FRONTEND_BASE_URL}/?public=entry&payment=pending&reservationId=${encodeURIComponent(reservationId)}`,
            failure: `${FRONTEND_BASE_URL}/?public=entry&payment=failure&reservationId=${encodeURIComponent(reservationId)}`,
          }
        : undefined,
      auto_return: 'approved',
      notification_url: `${req.protocol}://${req.get('host')}/api/mercadopago/webhook`,
      binary_mode: false,
    }

    const mpResponse = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: getBearer(),
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(preferencePayload),
    })

    if (!mpResponse.ok) {
      const text = await mpResponse.text()
      throw new Error(`MP preference create failed: ${mpResponse.status} ${text}`)
    }

    const preference = await mpResponse.json()

    await db.ref(`reservations/${reservationId}`).update({
      paymentProvider: 'mercadopago',
      paymentStatus: 'pending',
      paymentSource: sourceApp,
      listPrice: unitPrice,
      quantity,
      externalReference,
      preferenceId: preference.id ?? null,
      initPoint: preference.init_point ?? null,
      sandboxInitPoint: preference.sandbox_init_point ?? null,
      updatedAt: Date.now(),
    })

    await upsertPaymentAudit(`pref_${preference.id ?? reservationId}`, {
      kind: 'preference',
      reservationId,
      eventId,
      sourceApp,
      externalReference,
      preferenceId: preference.id ?? null,
      status: 'created',
      amount: unitPrice * quantity,
      currency: 'ARS',
      createdAt: Date.now(),
    })

    res.status(200).json({
      ok: true,
      preferenceId: preference.id,
      externalReference,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create preference.'
    res.status(500).json({ ok: false, message })
  }
})

app.post('/api/mercadopago/webhook', async (req, res) => {
  try {
    if (!isValidWebhookSignature(req.rawBody, req.header('x-signature'))) {
      res.status(401).json({ ok: false, message: 'Invalid webhook signature.' })
      return
    }

    const topic = req.query?.topic ?? req.body?.type
    const paymentIdRaw = req.query?.['data.id'] ?? req.body?.data?.id ?? req.body?.id
    const paymentId = typeof paymentIdRaw === 'string' || typeof paymentIdRaw === 'number'
      ? String(paymentIdRaw).trim()
      : ''

    if (topic !== 'payment' || !paymentId) {
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const payment = await fetchPayment(paymentId)
    const externalReference = typeof payment.external_reference === 'string' ? payment.external_reference.trim() : ''

    if (!externalReference.startsWith(`${MP_SOURCE_TAG}:`)) {
      await upsertPaymentAudit(paymentId, {
        kind: 'payment',
        ignored: true,
        reason: 'external_reference_not_owned',
        externalReference,
      })
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const reservationId = externalReference.replace(`${MP_SOURCE_TAG}:`, '').trim()
    if (!reservationId) {
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const lockRef = db.ref(`mpWebhookLocks/${paymentId}`)
    const lockResult = await lockRef.transaction((current) => {
      if (current && current.done === true) {
        return current
      }
      return { done: false, startedAt: Date.now() }
    })

    if (!lockResult.committed) {
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const currentLock = lockResult.snapshot.val()
    if (currentLock?.done === true) {
      res.status(200).json({ ok: true, duplicated: true })
      return
    }

    const reservationRef = db.ref(`reservations/${reservationId}`)
    const reservationSnap = await reservationRef.get()
    if (!reservationSnap.exists()) {
      await upsertPaymentAudit(paymentId, {
        kind: 'payment',
        reservationId,
        externalReference,
        status: payment.status ?? 'unknown',
        ignored: true,
        reason: 'reservation_not_found',
      })
      await lockRef.set({ done: true, ignored: true, reason: 'reservation_not_found', finishedAt: Date.now() })
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const paymentStatus = typeof payment.status === 'string' ? payment.status : 'unknown'
    const paymentAmount = typeof payment.transaction_amount === 'number' && Number.isFinite(payment.transaction_amount)
      ? payment.transaction_amount
      : null

    if (isAllowedStatus(paymentStatus)) {
      await reservationRef.update({
        paymentStatus: 'paid',
        amount: paymentAmount ?? reservationSnap.val()?.amount ?? 0,
        paidAt: Date.now(),
        paymentId,
        mpStatus: paymentStatus,
        mpStatusDetail: typeof payment.status_detail === 'string' ? payment.status_detail : null,
      })
    }

    await upsertPaymentAudit(paymentId, {
      kind: 'payment',
      reservationId,
      externalReference,
      status: paymentStatus,
      statusDetail: typeof payment.status_detail === 'string' ? payment.status_detail : null,
      amount: paymentAmount,
      currency: typeof payment.currency_id === 'string' ? payment.currency_id : 'ARS',
      metadata: payment.metadata ?? {},
      processed: isAllowedStatus(paymentStatus),
      createdAt: Date.now(),
    })

    await lockRef.set({ done: true, status: paymentStatus, finishedAt: Date.now() })
    res.status(200).json({ ok: true, paymentId, status: paymentStatus })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.'
    res.status(500).json({ ok: false, message })
  }
})

app.get('/api/mercadopago/reconciliation-summary', async (req, res) => {
  try {
    const sourceTag = typeof req.query?.sourceTag === 'string' ? req.query.sourceTag.trim() : MP_SOURCE_TAG
    const from = typeof req.query?.from === 'string' ? Date.parse(req.query.from) : Number.NaN
    const to = typeof req.query?.to === 'string' ? Date.parse(req.query.to) : Number.NaN

    const snapshot = await db.ref('mpPayments').get()
    if (!snapshot.exists()) {
      res.status(200).json({ ok: true, rows: [], total: 0 })
      return
    }

    const rows = Object.entries(snapshot.val() ?? {})
      .map(([paymentId, raw]) => {
        const value = raw ?? {}
        return {
          paymentId,
          reservationId: typeof value.reservationId === 'string' ? value.reservationId : null,
          externalReference: typeof value.externalReference === 'string' ? value.externalReference : '',
          status: typeof value.status === 'string' ? value.status : 'unknown',
          amount: typeof value.amount === 'number' ? value.amount : 0,
          currency: typeof value.currency === 'string' ? value.currency : 'ARS',
          createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
        }
      })
      .filter((row) => row.externalReference.startsWith(`${sourceTag}:`))
      .filter((row) => (Number.isFinite(from) ? row.createdAt >= from : true))
      .filter((row) => (Number.isFinite(to) ? row.createdAt <= to : true))
      .sort((a, b) => b.createdAt - a.createdAt)

    const total = rows
      .filter((row) => row.status === 'approved' || row.status === 'authorized')
      .reduce((acc, row) => acc + row.amount, 0)

    res.status(200).json({ ok: true, rows, total })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build reconciliation summary.'
    res.status(500).json({ ok: false, message })
  }
})

const port = Number(process.env.PORT ?? '8080')
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`somosnoche-mp-gateway listening on :${port}`)
})
