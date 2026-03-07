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

    this.ativo = false;

    this.stats = {
      processados: 0,
      enviados: 0,
      erros: 0
    };

    this._enviandoPara = new Set();
    this._respondendoPara = new Set();

  }

  // =================================
  // ENVIO EM PARTES
  // =================================

  async enviarEmPartes(numero, partes) {

    const resultados = [];

    for (let i = 0; i < partes.length; i++) {

      const parte = partes[i];

      if (!parte.trim()) continue;

      if (i > 0) {

        const pausaMs = 4000 + Math.random() * 6000;

        logger.info(
          `⌨️ Parte ${i+1}/${partes.length} aguardando ${(pausaMs/1000).toFixed(0)}s`
        );

        await new Promise(r => setTimeout(r, pausaMs));

      }

      const ok = await this.whatsapp.enviarMensagem(numero, parte);

      resultados.push(ok);

      if (!ok.sucesso) {

        logger.error(`❌ Falha ao enviar parte ${i+1}`);
        break;

      }

      logger.info(`✅ Parte ${i+1}/${partes.length} enviada`);

    }

    return resultados.every(r => r.sucesso);

  }

  // =================================
  // PROSPECÇÃO
  // =================================

  async executarCiclo({ segmento, cidade, limite = 20 }) {

    if (!this.horarioOk()) {

      logger.info('⏰ Fora do horário');
      return;

    }

    logger.info(
      `🚀 PROSPECÇÃO: ${segmento} | ${cidade}`
    );

    this.ativo = true;

    this.stats = {
      processados: 0,
      enviados: 0,
      erros: 0
    };

    try {

      await this.scraper.init();

      const empresas = await this.scraper.buscarEmpresas({
        segmento,
        cidade,
        limite
      });

      await this.scraper.fechar();

      for (const emp of empresas) {

        if (!this.ativo) break;

        emp.segmento = segmento;
        emp.cidade = cidade;

        await this.processarEmpresa(emp);

        this.stats.processados++;

        const espera = this.delay();

        logger.info(`⏳ ${(espera/1000).toFixed(0)}s até próxima`);

        await new Promise(r => setTimeout(r, espera));

      }

    } catch (err) {

      logger.error(err.message);

    } finally {

      this.ativo = false;

      logger.info(
        `📊 Processados: ${this.stats.processados} | Enviados: ${this.stats.enviados}`
      );

    }

  }

  // =================================
  // PROCESSAR EMPRESA
  // =================================

  async processarEmpresa(emp) {

    logger.info(`📊 ${emp.nome_empresa}`);

    const lead = await db.salvarLead(emp);

    if (!lead) return;

    if (lead.status !== 'novo') {

      logger.info(`⏭️ Já contatado`);
      return;

    }

    let diag = null;

    if (emp.site) {

      logger.info(`🔍 Analisando ${emp.site}`);

      const analise = await this.analyzer.analisar(emp.site);

      diag = await db.salvarDiag(lead.id, analise);

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

      logger.warn(`🔒 Duplicata bloqueada`);

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

      const ok = await this.whatsapp.enviarMensagem(
        lead.whatsapp,
        msg
      );

      if (ok.sucesso) {

        await db.update(lead.id, {
          status: 'contatado',
          data_contato: new Date()
        });

        await db.msg(lead.id, 'enviado', msg);

        this.stats.enviados++;

        logger.info(`✅ Enviado`);

      }

    } finally {

      setTimeout(() => {

        this._enviandoPara.delete(lead.whatsapp)

      }, 60000);

    }

  }

  // =================================
  // RESPOSTAS DO WHATSAPP
  // =================================

  async processarResposta(numero, texto, timestamp) {

    if (this._respondendoPara.has(numero)) {

      logger.warn(`🔒 Resposta duplicada bloqueada: ${numero}`);
      return;

    }

    this._respondendoPara.add(numero);

    try {

      const lead = await db.buscarLeadPorWhatsapp(numero);

      if (!lead) {

        logger.warn(`⚠️ Número não está na base: ${numero}`);
        return;

      }

      logger.info(`💬 RESPOSTA de ${lead.nome_empresa}`);

      await db.msg(lead.id, 'recebido', texto);

      const diagnostico = await db.buscarDiagnostico(lead.id);
      const conversas = await db.buscarConversas(lead.id);

      const resposta = await this.builder.gerarResposta(
        lead,
        texto,
        conversas,
        diagnostico
      );

      if (!resposta) return;

      const partes = resposta.split('\n\n');

      const ok = await this.enviarEmPartes(numero, partes);

      if (ok) {

        await db.msg(lead.id, 'enviado', resposta);

        logger.info(`✅ Resposta enviada`);

      }

    } catch (err) {

      logger.error(`Erro resposta: ${err.message}`);

    } finally {

      setTimeout(() => {

        this._respondendoPara.delete(numero)

      }, 10000);

    }

  }

  // =================================
  // FOLLOW UP
  // =================================

  async executarFollowUp() {

    const leads = await db.buscarParaFollowUp();

    for (const lead of leads) {

      if (this._enviandoPara.has(lead.whatsapp)) continue;

      this._enviandoPara.add(lead.whatsapp);

      try {

        const tentativa = (lead.followup_count || 0) + 1;

        const msg = await this.builder.gerarFollowUp(lead);

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

        }

      } finally {

        setTimeout(() => {

          this._enviandoPara.delete(lead.whatsapp)

        }, 60000);

      }

    }

  }

  // =================================

  delay() {

    const b = parseInt(process.env.DELAY_ENTRE_MENSAGENS) || 50000;

    return b + (Math.random() * b * 0.4) - (b * 0.2);

  }

  horarioOk() {

    const n = new Date();
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
