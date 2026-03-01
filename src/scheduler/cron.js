import cron from 'node-cron';
import { Orchestrator } from '../automation/orchestrator.js';
import { db } from '../crm/database.js';
import { logger } from '../utils/logger.js';

export const orchestrator = new Orchestrator();

// ═══════════════════════════════════════
//  EDITE SUAS CAMPANHAS AQUI
// ═══════════════════════════════════════
const CAMPANHAS = [
  { segmento: 'clínica médica',  cidade: 'São Paulo', limite: 15 },
  { segmento: 'advogado',        cidade: 'São Paulo', limite: 15 },
  { segmento: 'dentista',        cidade: 'São Paulo', limite: 15 },
  { segmento: 'imobiliária',     cidade: 'São Paulo', limite: 10 },
  { segmento: 'academia',        cidade: 'São Paulo', limite: 10 },
  { segmento: 'restaurante',     cidade: 'São Paulo', limite: 10 },
];

let idx = 0;

// 9h, 11h, 14h e 16h — dias úteis
cron.schedule('0 9,11,14,16 * * 1-5', async () => {
  const c = CAMPANHAS[idx++ % CAMPANHAS.length];
  logger.info(`⏰ Cron → ${c.segmento} em ${c.cidade}`);
  await orchestrator.executarCiclo(c);
});

// Relatório 19h
cron.schedule('0 19 * * 1-5', async () => {
  const m = await db.metricas();
  logger.info(`\n📊 RELATÓRIO DIÁRIO\nLeads: ${m.total_leads} | Enviados: ${m.enviados_hoje} | Respostas: ${m.responderam_hoje} | Reuniões: ${m.reunioes_hoje} | Taxa: ${m.taxa_resposta}`);
});

logger.info('✅ Scheduler ativo');
