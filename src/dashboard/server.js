import 'dotenv/config'

import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { orchestrator } from '../automation/orchestrator.js'
import { db } from '../crm/database.js'
import { logger } from '../utils/logger.js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// =============================
// BODY PARSER
// =============================
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(express.static(join(__dirname, 'public')))

// =============================
// AUTH DASHBOARD
// =============================
const auth = (req, res, next) => {

  if (req.headers['x-api-key'] === process.env.DASHBOARD_SECRET) {
    return next()
  }

  res.status(401).json({ erro: 'Não autorizado' })
}

// =============================
// API DASHBOARD
// =============================

app.get('/api/metricas', auth, async (_, res) => {

  const m = await db.metricas()

  res.json({
    ...m,
    ...orchestrator.status
  })

})

app.get('/api/leads', auth, async (req, res) => {

  const pagina = parseInt(req.query.p) || 0

  const leads = await db.listar(pagina)

  res.json(leads)

})

app.get('/api/leads/:id/msgs', auth, async (req, res) => {

  const { data } = await sb
    .from('conversas')
    .select('*')
    .eq('lead_id', req.params.id)
    .order('created_at')

  res.json(data || [])

})

app.post('/api/iniciar', auth, async (req, res) => {

  const { segmento, cidade, limite } = req.body

  if (!segmento || !cidade) {
    return res.status(400).json({
      erro: 'segmento e cidade obrigatórios'
    })
  }

  if (orchestrator.status.ativo) {
    return res.status(409).json({
      erro: 'Prospecção já em andamento'
    })
  }

  orchestrator
    .executarCiclo({
      segmento,
      cidade,
      limite: limite || 20
    })
    .catch(console.error)

  res.json({
    ok: true,
    msg: `Iniciado: ${segmento} em ${cidade}`
  })

})

app.post('/api/pausar', auth, (_, res) => {

  orchestrator.pausar()

  res.json({ ok: true })

})

// =============================
// CACHE DUPLICATA UAIZAP
// =============================
const cacheMsg = new Map()

// =============================
// WEBHOOK WHATSAPP
// =============================

app.post('/webhook/whatsapp', async (req, res) => {

  try {

    logger.info('🔥 WEBHOOK RECEBIDO')

    const body = req.body

    if (!body) {
      return res.sendStatus(200)
    }

    // =============================
    // ID DA MENSAGEM
    // =============================

    const msgId =
      body?.message?.messageid ||
      body?.data?.messageid ||
      body?.key?.id

    if (msgId) {

      if (cacheMsg.has(msgId)) {

        logger.warn(`⚠️ Duplicata ignorada: ${msgId}`)

        return res.sendStatus(200)

      }

      cacheMsg.set(msgId, Date.now())

      setTimeout(() => {

        cacheMsg.delete(msgId)

      }, 30000)

    }

    // =============================
    // PARSE DA MENSAGEM
    // =============================

    const m = orchestrator.whatsapp.parsearWebhook(body)

    if (!m || !m.texto) {

      logger.warn('⚠️ Webhook sem texto')

      return res.sendStatus(200)

    }

    logger.info(`📩 Mensagem recebida`)
    logger.info(`👤 Número: ${m.numero}`)
    logger.info(`💬 Texto: ${m.texto}`)

    await orchestrator.processarResposta(
      m.numero,
      m.texto,
      m.timestamp
    )

    res.sendStatus(200)

  } catch (err) {

    logger.error(`❌ ERRO WEBHOOK: ${err.message}`)

    res.sendStatus(500)

  }

})

// =============================
// HEALTH CHECK
// =============================

app.get('/', (_, res) => {

  res.send('LEAD MACHINE ONLINE')

})

// =============================
// CONFIGURAÇÕES
// =============================

app.get('/api/configuracoes', auth, async (req, res) => {

  const { data } = await sb
    .from('configuracoes')
    .select('id, valor')

  const configs = {}

  ;(data || []).forEach(row => {

    configs[row.id] = row.valor

  })

  res.json(configs)

})

app.post('/api/configuracoes', auth, async (req, res) => {

  const { id, valor } = req.body

  const { error } = await sb
    .from('configuracoes')
    .upsert(
      {
        id,
        valor,
        updated_at: new Date()
      },
      {
        onConflict: 'id'
      }
    )

  if (error) {

    return res.status(500).json({
      erro: error.message
    })

  }

  res.json({ ok: true })

})

app.get('/configuracoes', (req, res) => {

  res.sendFile(join(__dirname, 'public', 'settings.html'))

})

// =============================
// START SERVER
// =============================

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {

  logger.info('')
  logger.info('🤖 LEAD MACHINE v1.0')
  logger.info('📡 Prospecção B2B Automatizada')
  logger.info('')

  logger.info(`✅ Dashboard: http://localhost:${PORT}`)

  logger.info(
    `📡 Webhook: http://SEU-IP:${PORT}/webhook/whatsapp`
  )

})
