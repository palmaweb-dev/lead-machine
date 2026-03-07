import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { orchestrator } from '../scheduler/cron.js';
import { db } from '../crm/database.js';
import { logger } from '../utils/logger.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =============================
// BODY PARSER (corrigido)
// =============================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(join(__dirname, 'public')));


// =============================
// AUTH DASHBOARD
// =============================
const auth = (req, res, next) => {
  if (req.headers['x-api-key'] === process.env.DASHBOARD_SECRET) {
    return next();
  }
  res.status(401).json({ erro: 'Não autorizado' });
};


// =============================
// API DASHBOARD
// =============================

app.get('/api/metricas', auth, async (_, res) => {
  const m = await db.metricas();
  res.json({ ...m, ...orchestrator.status });
});

app.get('/api/leads', auth, async (req, res) => {
  res.json(await db.listar(parseInt(req.query.p) || 0));
});

app.get('/api/leads/:id/msgs', auth, async (req, res) => {
  const { data } = await sb
    .from('conversas')
    .select('*')
    .eq('lead_id', req.params.id)
    .order('created_at');

  res.json(data || []);
});

app.post('/api/iniciar', auth, async (req, res) => {

  const { segmento, cidade, limite } = req.body;

  if (!segmento || !cidade) {
    return res.status(400).json({
      erro: 'segmento e cidade obrigatórios'
    });
  }

  if (orchestrator.status.ativo) {
    return res.status(409).json({
      erro: 'Prospecção já em andamento'
    });
  }

  orchestrator
    .executarCiclo({
      segmento,
      cidade,
      limite: limite || 20
    })
    .catch(console.error);

  res.json({
    ok: true,
    msg: `Iniciado: ${segmento} em ${cidade}`
  });

});

app.post('/api/pausar', auth, (_, res) => {
  orchestrator.pausar();
  res.json({ ok: true });
});


// =============================
// WEBHOOK UAZAPI
// =============================
app.post('/webhook/whatsapp', async (req, res) => {

  try {

    console.log('🔥 WEBHOOK RECEBIDO');

    const body = req.body;

    // =============================
    // FIX DUPLICATA UAIZAPI
    // =============================
    const _msgId = body?.message?.messageid || body?.data?.messageid;

    if (_msgId) {

      if (global._uazapiMsgCache?.has(_msgId)) {
        console.log('⚠️ Duplicata ignorada:', _msgId);
        return res.sendStatus(200);
      }

      if (!global._uazapiMsgCache) {
        global._uazapiMsgCache = new Map();
      }

      global._uazapiMsgCache.set(_msgId, Date.now());

      setTimeout(() => {
        global._uazapiMsgCache?.delete(_msgId);
      }, 30000);

    }

    if (!body) {
      return res.sendStatus(200);
    }

    // Parse usando orchestrator
    const m = orchestrator.whatsapp.parsearWebhook(body);

    if (m?.texto) {

      console.log('📩 Mensagem recebida');
      console.log('👤 Número:', m.numero);
      console.log('💬 Texto:', m.texto);

      await orchestrator.processarResposta(
        m.numero,
        m.texto,
        m.timestamp
      );

    } else {

      console.log('⚠️ Webhook sem texto válido');

    }

    res.sendStatus(200);

  } catch (err) {

    console.error('❌ ERRO WEBHOOK:', err);
    res.sendStatus(500);

  }

});


// =============================
// HEALTH CHECK
// =============================
app.get('/', (_, res) => {
  res.send('LEAD MACHINE ONLINE');
});


// =============================
// CONFIGURAÇÕES
// =============================

app.get('/api/configuracoes', auth, async (req, res) => {

  const { data } = await sb
    .from('configuracoes')
    .select('id, valor');

  const configs = {};

  (data || []).forEach(row => {
    configs[row.id] = row.valor;
  });

  res.json(configs);

});

app.post('/api/configuracoes', auth, async (req, res) => {

  const { id, valor } = req.body;

  const { error } = await sb
    .from('configuracoes')
    .upsert(
      { id, valor, updated_at: new Date() },
      { onConflict: 'id' }
    );

  if (error) {
    return res.status(500).json({ erro: error.message });
  }

  res.json({ ok: true });

});

app.get('/configuracoes', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'settings.html'));
});


// =============================
// START SERVER
// =============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  logger.info(`✅ Dashboard: http://localhost:${PORT}`);

  logger.info(
    `📡 Webhook: http://SEU-IP:${PORT}/webhook/whatsapp`
  );

});
