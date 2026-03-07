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
  }

  async executarCiclo({ segmento, cidade, limite = 20 }) {
    if (!this.horarioOk()) { logger.info('⏰ Fora do horário permitido.'); return; }

    logger.info(`\n${'═'.repeat(55)}\n🚀 PROSPECÇÃO: ${segmento} | ${cidade} | limite: ${limite}\n${'═'.repeat(55)}`);
    this.ativo = true;
    this.stats = { processados: 0, enviados: 0, erros: 0 };

    try {
      await this.scraper.init();
      const empresas = await this.scraper.buscarEmpresas({ segmento, cidade, limite });
      await this.scraper.fechar();

      for (const emp of empresas) {
        if (!this.ativo) break;
        emp.segmento = segmento;
        emp.cidade = cidade;
        await this.processarEmpresa(emp);
        this.stats.processados++;
        const espera = this.delay();
        logger.info(`⏳ ${(espera / 1000).toFixed(0)}s até próxima...\n`);
        await new Promise(r => setTimeout(r, espera));
      }
    } catch (e) {
      logger.error(`Erro crítico: ${e.message}`);
    } finally {
      this.ativo = false;
      logger.info(`\n📊 Processados: ${this.stats.processados} | Enviados: ${this.stats.enviados} | Erros: ${this.stats.erros}`);
    }
  }

  async processarEmpresa(emp) {
    logger.info(`📊 ${emp.nome_empresa}`);
    const lead = await db.salvarLead(emp);
    if (!lead) { this.stats.erros++; return; }

    // ANTI-DUPLICATA: verificar status
    if (lead.status !== 'novo') {
      logger.info(`  ⏭️  Já contatado (${lead.status}) — pulando`);
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
      logger.warn(`  ⚠️  Sem WhatsApp`);
      await db.update(lead.id, { status: 'sem_contato' });
      return;
    }

    // ANTI-DUPLICATA: lock por número
    if (this._enviandoPara.has(lead.whatsapp)) {
      logger.warn(`  🔒 Duplicata bloqueada: ${lead.whatsapp}`);
      return;
    }
    this._enviandoPara.add(lead.whatsapp);

    try {
      const valido = await this.whatsapp.verificarNumero(lead.whatsapp);
      if (!valido) { await db.update(lead.id, { status: 'numero_invalido' }); return; }

      const msg = await this.builder.construirInicial(lead, diag);
      const ok  = await this.whatsapp.enviarMensagem(lead.whatsapp, msg);

      if (ok.sucesso) {
        await db.update(lead.id, { status: 'contatado', data_contato: new Date() });
        await db.msg(lead.id, 'enviado', msg);
        this.stats.enviados++;
        logger.info(`  ✅ Mensagem enviada!`);
      } else { this.stats.erros++; }
    } finally {
      setTimeout(() => this._enviandoPara.delete(lead.whatsapp), 60000);
    }
  }

  async processarResposta(numero, texto, timestamp = null) {
    logger.info(`\n${'─'.repeat(50)}`);
    logger.info(`📩 RESPOSTA de ${numero}: "${texto.substring(0, 80)}..."`);

    const lead = await db.porWhatsAppCompleto(numero);
    if (!lead) { logger.warn(`  ⚠️  Número não está na base`); return; }

    logger.info(`  🏢 ${lead.nome_empresa} | Status: ${lead.status}`);

    // PROTEO: cooldown de 2 minutos entre respostas ao mesmo lead
    if (lead.data_resposta) {
      const agora = Date.now();
      const ultimaResposta = new Date(lead.data_resposta).getTime();
      const diffMinutos = (agora - ultimaResposta) / 1000 / 60;
      if (diffMinutos < 2) {
        logger.warn(` Cooldown ativo para ${lead.nome_empresa} (${diffMinutos.toFixed(1)}min atrs)  ignorando`);
        return;
      }
    }

    // PROTEO: ignorar mensagens anteriores ao contato inicial do bot
    if (lead.data_contato && timestamp) {
      const msgTime = new Date(timestamp).getTime();
      const contatoTime = new Date(lead.data_contato).getTime();
      if (msgTime < contatoTime - 5000) {
        logger.warn(` Mensagem anterior ao contato inicial  ignorando`);
        return;
      }
    }


    // Mensagem de stop
    if (this.builder.ehMensagemDeStop(texto)) {
      logger.info(`  🚫 Lead pediu para parar`);
      await db.update(lead.id, { status: 'descartado' });
      await db.msg(lead.id, 'recebido', texto);
      await this.whatsapp.enviarMensagem(numero, `Entendido! Não vou mais entrar em contato. Boa sorte com o negócio! 👊`);
      return;
    }

    const ehBot = this.builder.detectarBot(texto);
    if (ehBot) { logger.info(`  🤖 Bot adversário detectado`); await db.update(lead.id, { status: 'bot_detectado' }); }

    await db.msg(lead.id, 'recebido', texto);
    await db.update(lead.id, { status: 'respondeu', data_resposta: new Date() });

    const interesse = await this.builder.classificarInteresse(texto);
    await db.update(lead.id, { interesse });
    logger.info(`  🌡️  Interesse: ${interesse.toUpperCase()}`);

    const delayMs = ehBot ? 3000 + Math.random() * 2000 : 10000 + Math.random() * 20000;
    logger.info(`  ⏳ Respondendo em ${(delayMs / 1000).toFixed(0)}s...`);
    await new Promise(r => setTimeout(r, delayMs));

    const diagnostico = lead.diagnosticos?.[0] || null;
    const historico   = lead.conversas || [];

    const resposta = await this.builder.gerarResposta(historico, texto, lead, diagnostico);
    const ok = await this.whatsapp.enviarMensagem(numero, resposta);

    if (ok.sucesso) {
      await db.msg(lead.id, 'enviado', resposta);
      logger.info(`  ✅ Resposta enviada`);
      if (resposta.includes(process.env.CALENDLY_LINK || 'calendly')) {
        await db.update(lead.id, { status: 'link_enviado' });
        logger.info(`  🔗 Link de agendamento enviado!`);
      }
    }

    if (interesse === 'quente') await db.update(lead.id, { status: 'quente' });
    else if (interesse === 'frio') await db.update(lead.id, { status: 'frio' });
  }

  async executarFollowUp() {
    if (!this.horarioOk()) return;
    logger.info('\n🔄 Follow-ups inteligentes...');
    const leads = await db.buscarParaFollowUp();
    logger.info(`  ${leads.length} leads`);

    for (const lead of leads) {
      const tentativa = (lead.followup_count || 0) + 1;
      if (tentativa > 3) { await db.update(lead.id, { status: 'perdido' }); continue; }

      const diagnostico = await db.buscarDiagnostico(lead.id);
      const conversas   = await db.buscarConversas(lead.id);
      const msg = await this.builder.gerarFollowUp(lead, conversas, diagnostico, tentativa);
      const ok  = await this.whatsapp.enviarMensagem(lead.whatsapp, msg);

      if (ok.sucesso) {
        await db.update(lead.id, { status: 'followup_enviado', followup_count: tentativa });
        await db.msg(lead.id, 'enviado', msg);
        logger.info(`  ✓ Follow-up #${tentativa}: ${lead.nome_empresa}`);
      }
      await new Promise(r => setTimeout(r, this.delay()));
    }
  }

  delay() {
    const b = parseInt(process.env.DELAY_ENTRE_MENSAGENS) || 50000;
    return b + (Math.random() * b * 0.4) - (b * 0.2);
  }

  horarioOk() {
    const n = new Date(), d = n.getDay();
    if (d === 0 || d === 6) return false;
    const h = n.getHours();
    const [hi] = (process.env.HORARIO_INICIO || '09:00').split(':').map(Number);
    const [hf] = (process.env.HORARIO_FIM || '23:59').split(':').map(Number);
    return h >= hi && h < hf;
  }

  pausar() { this.ativo = false; }
  get status() { return { ativo: this.ativo, stats: this.stats }; }
}
