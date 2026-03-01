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

app.use(express.json());
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
  const pagina = Number.parseInt(req.query.p, 10) || 0;
  const limite = Number.parseInt(req.query.limit, 10) || 30;
  res.json(await db.listar(pagina, limite));
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
// WEBHOOK EVOLUTION API
// =============================
app.post('/webhook/whatsapp', async (req, res) => {

  try {

    console.log('🔥 WEBHOOK RECEBIDO');
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (!body) {
      return res.sendStatus(200);
    }

    // Parse usando seu orchestrator
    const m = orchestrator.whatsapp.parsearWebhook(body);

    if (m?.texto) {

      console.log('📩 Mensagem recebida');
      console.log('👤 Número:', m.numero);
      console.log('💬 Texto:', m.texto);

      await orchestrator.processarResposta(
        m.numero,
        m.texto
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
// START SERVER
// =============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  logger.info(`✅ Dashboard: http://localhost:${PORT}`);

  logger.info(
    `📡 Webhook: http://SEU-IP:${PORT}/webhook/whatsapp`
  );

});
