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
  }

  /* =====================================================
     CICLO PRINCIPAL
  ===================================================== */

  async executarCiclo({ segmento, cidade, limite = 20 }) {

    logger.info(`
══════════════════════════════════════════════════
🚀 ${segmento} | ${cidade} | limite: ${limite}
══════════════════════════════════════════════════
`);

    this.ativo = true;
    this.stats = { processados: 0, enviados: 0, erros: 0 };

    try {

      await this.scraper.init();

      const empresas = await this.scraper.buscarEmpresas(
        segmento,
        cidade,
        limite
      );

      await this.scraper.fechar();

      logger.info(`📋 ${empresas.length} empresas encontradas`);

      for (const emp of empresas) {

        if (!this.ativo) break;

        emp.segmento = segmento;
        emp.cidade   = cidade;

        await this.processarEmpresa(emp);

        this.stats.processados++;

        const espera = this.delayHumano();

        logger.info(`⏳ ${(espera / 1000).toFixed(0)}s até próxima...\n`);

        await new Promise(r => setTimeout(r, espera));
      }

    } catch (erro) {

      logger.error(`❌ Erro crítico: ${erro.message}`);

    } finally {

      this.ativo = false;

      logger.info(
        `📊 Processados: ${this.stats.processados} | Enviados: ${this.stats.enviados} | Erros: ${this.stats.erros}`
      );
    }
  }

  /* =====================================================
     PROCESSAR EMPRESA
  ===================================================== */

  async processarEmpresa(emp) {

    try {

      logger.info(`📊 ${emp.nome_empresa}`);

      const lead = await db.salvarLead(emp);

      if (!lead) {
        this.stats.erros++;
        return;
      }

      /* -------------------------
         ANALISAR SITE
      -------------------------- */

      let diagnostico = null;

      if (emp.site) {

        logger.info(`🔍 Analisando: ${emp.site}`);

        const analise = await this.analyzer.analisar(emp.site);

        diagnostico = await db.salvarDiagnostico(
          lead.id,
          analise
        );

        if (!emp.whatsapp && analise?.whatsapp_encontrado) {
          emp.whatsapp = analise.whatsapp_encontrado;
        }
      }

      /* -------------------------
         VALIDAR WHATSAPP
      -------------------------- */

      if (!emp.whatsapp) {

        logger.warn(`⚠️ Sem WhatsApp`);

        await db.atualizarStatus(lead.id, 'sem_contato');

        return;
      }

      const numeroValido =
        await this.whatsapp.verificarNumero(emp.whatsapp);

      if (!numeroValido) {

        logger.warn(`⚠️ Número inválido`);

        await db.atualizarStatus(lead.id, 'numero_invalido');

        return;
      }

      /* -------------------------
         CONSTRUIR MENSAGEM
      -------------------------- */

      const mensagem =
        this.builder.construirMensagemInicial(emp, diagnostico);

      const resultado =
        await this.whatsapp.enviarMensagem(emp.whatsapp, mensagem);

      if (resultado?.sucesso) {

        this.stats.enviados++;

        await db.atualizarStatus(lead.id, 'contatado', {
          data_contato: new Date()
        });

        await db.registrarConversa(
          lead.id,
          'enviado',
          mensagem
        );

        logger.info(`✅ Mensagem enviada`);

      } else {

        this.stats.erros++;

        logger.error(`❌ Falha envio`);

      }

    } catch (erro) {

      this.stats.erros++;

      logger.error(`❌ Erro empresa: ${erro.message}`);

    }
  }

  /* =====================================================
     PROCESSAR RESPOSTA DO LEAD
  ===================================================== */

  async processarResposta(numero, mensagem) {

    try {

      logger.info(`📩 Resposta de ${numero}: ${mensagem}`);

      const lead =
        await db.buscarLeadPorWhatsApp(numero);

      if (!lead) {
        logger.warn(`Lead não encontrado`);
        return;
      }

      /* Registrar conversa */

      await db.registrarConversa(
        lead.id,
        'recebido',
        mensagem
      );

      await db.atualizarStatus(
        lead.id,
        'respondeu',
        { data_resposta: new Date() }
      );

      /* Classificar interesse */

      const interesse =
        await this.builder.classificarInteresse(mensagem);

      logger.info(`🌡️ Interesse: ${interesse}`);

      await db.atualizarStatus(
        lead.id,
        'respondeu',
        { interesse }
      );

      /* Gerar resposta IA */

      const historico = lead.conversas || [];

      const resposta =
        await this.builder.gerarRespostaIA(
          historico,
          mensagem,
          lead
        );

      if (!resposta) return;

      /* Delay humano */

      await new Promise(r =>
        setTimeout(r, 3000 + Math.random() * 5000)
      );

      await this.whatsapp.enviarMensagem(
        numero,
        resposta
      );

      await db.registrarConversa(
        lead.id,
        'enviado',
        resposta
      );

      if (interesse === 'quente') {
        await db.atualizarStatus(
          lead.id,
          'quente',
          { interesse: 'quente' }
        );
      }

      logger.info(`🤖 Resposta enviada`);

    } catch (erro) {

      logger.error(`❌ Erro resposta: ${erro.message}`);

    }
  }

  /* =====================================================
     CONTROLES
  ===================================================== */

  delayHumano() {

    const base =
      parseInt(process.env.DELAY_ENTRE_MENSAGENS) || 45000;

    const variacao = base * 0.4;

    return base + (Math.random() * variacao * 2 - variacao);
  }

  pausar() {
    this.ativo = false;
  }

  get status() {
    return {
      ativo: this.ativo,
      ...this.stats
    };
  }
}
