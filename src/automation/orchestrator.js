import { MapsScraper } from '../prospecting/mapsScraper.js';
import { SiteAnalyzer } from '../analyzer/siteAnalyzer.js';
import { WhatsAppClient } from '../whatsapp/whatsappClient.js';
import { MessageBuilder } from '../whatsapp/messageBuilder.js';
import { db } from '../crm/database.js';
import { logger } from '../utils/logger.js';

export class Orchestrator {
  constructor() {
    this.scraper  = new MapsScraper();
    this.analyzer = new SiteAnalyzer();
    this.whatsapp = new WhatsAppClient();
    this.builder  = new MessageBuilder();
    this.ativo    = false;
    this.stats    = { processados: 0, enviados: 0, erros: 0 };
    this._enviandoPara = new Set();
    this._respondendoPara = new Set();
  }

  async enviarEmPartes(numero, partes) {
    const resultados = [];

    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      if (!parte.trim()) continue;

      if (i > 0) {
        const pausaMs = 4000 + Math.random() * 6000;
        logger.info(`  ⌨️  Parte ${i+1}/${partes.length} — aguardando ${(pausaMs/1000).toFixed(0)}s...`);
        await new Promise(r => setTimeout(r, pausaMs));
      }

      const ok = await this.whatsapp.enviarMensagem(numero, parte);
      resultados.push(ok);

      if (!ok.sucesso) {
        logger.error(`  ❌ Falha ao enviar parte ${i+1}`);
        break;
      }

      logger.info(`  ✅ Parte ${i+1}/${partes.length} enviada`);
    }

    return resultados.every(r => r.sucesso);
  }

  async executarCiclo({ segmento, cidade, limite = 20 }) {
    if (!this.horarioOk()) { logger.info('⏰ Fora do horário.'); return; }

    logger.info(`\n${'═'.repeat(55)}\n🚀 PROSPECÇÃO: ${segmento} | ${cidade} | ${limite} leads\n${'═'.repeat(55)}`);
    this.ativo = true;
    this.stats = { processados: 0, enviados: 0, erros: 0 };

    try {
      await this.scraper.init();
      const empresas = await this.scraper.buscarEmpresas({ segmento, cidade, limite });
      await this.scraper.fechar();

      for (const emp of empresas) {
        if (!this.ativo) break;
        emp.segmento = segmento; emp.cidade = cidade;
        await this.processarEmpresa(emp);
        this.stats.processados++;

        const espera = this.delay();
        logger.info(`⏳ ${(espera/1000).toFixed(0)}s até próxima...\n`);
        await new Promise(r => setTimeout(r, espera));
      }
    } catch (e) {
      logger.error(`Erro: ${e.message}`);
    } finally {
      this.ativo = false;
      logger.info(`\n📊 Processados: ${this.stats.processados} | Enviados: ${this.stats.enviados} | Erros: ${this.stats.erros}`);
    }
  }

  async processarEmpresa(emp) {
    logger.info(`📊 ${emp.nome_empresa}`);
    const lead = await db.salvarLead(emp);
    if (!lead) { this.stats.erros++; return; }

    if (lead.status !== 'novo') {
      logger.info(`  ⏭️  Já contatado (${lead.status})`);
      return;
    }

    let diag = null;
    if (emp.site) {
      logger.info(`  🔍 Analisando: ${emp.site}`);
      const analise = await this.analyzer.analisar(emp.site);
      diag = await db.salvarDiag(lead.id, analise);

      logger.info(`  📈 Score: ${analise.score}/100 | Problemas: ${analise.problemas.length}`);

      if (!lead.whatsapp && analise.whatsapp_encontrado) {
        const wp = `55${analise.whatsapp_encontrado}`;
        await db.update(lead.id, { whatsapp: wp });
        lead.whatsapp = wp;
      }
    }

    if (!lead.whatsapp) {
      await db.update(lead.id, { status: 'sem_contato' });
      return;
    }

    if (this._enviandoPara.has(lead.whatsapp)) {
      logger.warn(`  🔒 Duplicata bloqueada`);
      return;
    }
    this._enviandoPara.add(lead.whatsapp);

    try {
      const valido = await this.whatsapp.verificarNumero(lead.whatsapp);
      if (!valido) {
        await db.update(lead.id, { status: 'numero_invalido' });
        return;
      }

      const msg = await this.builder.construirInicial(lead, diag);
      const ok  = await this.whatsapp.enviarMensagem(lead.whatsapp, msg);

      if (ok.sucesso) {
        await db.update(lead.id, { status: 'contatado', data_contato: new Date() });
        await db.msg(lead.id, 'enviado', msg);
        this.stats.enviados++;
        logger.info(`  ✅ Enviado!`);
      } else {
        this.stats.erros++;
      }

    } finally {
      setTimeout(() => this._enviandoPara.delete(lead.whatsapp), 60000);
    }
  }

  async executarFollowUp() {
    if (!this.horarioOk()) return;

    logger.info('\n🔄 Follow-ups...');
    const leads = await db.buscarParaFollowUp();
    logger.info(`  ${leads.length} leads`);

    for (const lead of leads) {

      // 🔒 Bloqueio anti-duplicação
      if (this._enviandoPara.has(lead.whatsapp)) {
        logger.warn(`  🔒 Follow-up bloqueado (duplicado): ${lead.whatsapp}`);
        continue;
      }
      this._enviandoPara.add(lead.whatsapp);

      try {

        const tentativa = (lead.followup_count || 0) + 1;

        if (tentativa > 3) {
          await db.update(lead.id, { status: 'perdido' });
          continue;
        }

        const diagnostico = await db.buscarDiagnostico(lead.id);
        const conversas   = await db.buscarConversas(lead.id);

        const msg = await this.builder.gerarFollowUp(
          lead,
          conversas,
          diagnostico,
          tentativa
        );

        const ok = await this.whatsapp.enviarMensagem(
          lead.whatsapp,
          msg
        );

        if (ok.sucesso) {
          await db.update(lead.id, {
            status: 'followup_enviado',
            followup_count: tentativa
          });

          await db.msg(lead.id, 'enviado', msg);

          logger.info(`  ✓ Follow-up #${tentativa}: ${lead.nome_empresa}`);
        }

        await new Promise(r => setTimeout(r, this.delay()));

      } finally {
        setTimeout(() => this._enviandoPara.delete(lead.whatsapp), 60000);
      }
    }
  }

  delay() {
    const b = parseInt(process.env.DELAY_ENTRE_MENSAGENS) || 50000;
    return b + (Math.random() * b * 0.4) - (b * 0.2);
  }

  horarioOk() {
    const n = new Date(), d = n.getDay();

    if (process.env.ALLOW_WEEKENDS !== 'true' && (d === 0 || d === 6)) {
      return false;
    }

    const h = n.getHours();

    const [hi] = (process.env.HORARIO_INICIO || '09:00')
      .split(':')
      .map(Number);

    const [hf] = (process.env.HORARIO_FIM || '23:59')
      .split(':')
      .map(Number);

    return h >= hi && h < hf;
  }

  pausar() {
    this.ativo = false;
  }

  get status() {
    return {
      ativo: this.ativo,
      stats: this.stats
    };
  }
}
