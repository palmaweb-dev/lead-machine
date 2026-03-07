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
];

let idx = 0;

// Prospecção: 9h, 11h, 14h e 16h — dias úteis
cron.schedule('0 9,11,14,16 * * 1-5', async () => {
  const c = CAMPANHAS[idx++ % CAMPANHAS.length];
  logger.info(`⏰ Cron prospecção → ${c.segmento} em ${c.cidade}`);
  await orchestrator.executarCiclo(c);
});

// Follow-up: 10h e 15h — leads sem resposta há 48h
cron.schedule('0 10,15 * * 1-5', async () => {
  logger.info('⏰ Cron follow-up...');
  await orchestrator.executarFollowUp();
});

// Relatório: 19h
cron.schedule('0 19 * * 1-5', async () => {
  const m = await db.metricas();
  logger.info(`
╔══════════════════════════════════════╗
║         📊 RELATÓRIO DIÁRIO          ║
╠══════════════════════════════════════╣
║ Total leads:       ${String(m.total_leads).padEnd(17)}║
║ Enviados hoje:     ${String(m.enviados_hoje).padEnd(17)}║
║ Respostas hoje:    ${String(m.responderam_hoje).padEnd(17)}║
║ Taxa de resposta:  ${String(m.taxa_resposta).padEnd(17)}║
║ Leads quentes:     ${String(m.leads_quentes).padEnd(17)}║
║ Links enviados:    ${String(m.links_enviados).padEnd(17)}║
║ Reuniões:          ${String(m.reunioes_agendadas).padEnd(17)}║
╚══════════════════════════════════════╝`);
});

logger.info('✅ Scheduler ativo — prospecção 9h/11h/14h/16h | follow-up 10h/15h');
