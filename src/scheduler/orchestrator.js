import { MapsScraper } from '../prospecting/mapsScraper.js';
import { SiteAnalyzer } from '../analyzer/siteAnalyzer.js';
import { WhatsAppClient } from '../whatsapp/whatsappClient.js';
import { MessageBuilder } from '../whatsapp/messageBuilder.js';
import { db } from '../crm/database.js';
import { logger } from '../utils/logger.js';

export class Orchestrator {
  constructor() {
    this.scraper = new MapsScraper();
    this.analyzer = new SiteAnalyzer();
    this.whatsapp = new WhatsAppClient();
    this.builder = new MessageBuilder();
    this.ativo = false;
  }

  async executarCicloCompleto(segmento, cidade, limite = 20) {
    if (!this.dentroDoHorario()) {
      logger.info('Fora do horário de envio. Aguardando...');
      return;
    }

    logger.info(`\n🚀 Iniciando ciclo: ${segmento} em ${cidade}`);
    this.ativo = true;

    try {
      // 1. Prospecção
      await this.scraper.init();
      const empresas = await this.scraper.buscarEmpresas({ segmento, cidade, limite });
      await this.scraper.fechar();
      
      logger.info(`📋 ${empresas.length} empresas encontradas`);

      for (const empresa of empresas) {
        if (!this.ativo) break;

        await this.processarEmpresa(empresa, segmento);

        // Delay humano entre processos
        const delay = this.delayHumano();
        logger.info(`⏳ Aguardando ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }

    } catch (erro) {
      logger.error('Erro no ciclo:', erro);
    } finally {
      this.ativo = false;
    }
  }

  async processarEmpresa(empresa, segmento) {
    logger.info(`\n📊 Processando: ${empresa.nome}`);

    // Salvar lead
    empresa.segmento = segmento;
    const lead = await db.salvarLead(empresa);
    if (!lead) return;

    // Analisar site
    let diagnostico = null;
    if (empresa.site) {
      logger.info(`🔍 Analisando site: ${empresa.site}`);
      const analise = await this.analyzer.analisar(empresa.site);
      diagnostico = await db.salvarDiagnostico(lead.id, analise);

      // Usar WhatsApp encontrado no site se não tinha
      if (!empresa.whatsapp && analise.whatsapp_encontrado) {
        empresa.whatsapp = analise.whatsapp_encontrado;
        await db.atualizarStatus(lead.id, 'novo', { whatsapp: empresa.whatsapp });
      }
    }

    // Verificar e enviar mensagem
    if (!empresa.whatsapp) {
      logger.warn(`⚠️  Sem WhatsApp: ${empresa.nome}`);
      await db.atualizarStatus(lead.id, 'sem_contato');
      return;
    }

    // Verificar se número existe no WhatsApp
    const numeroValido = await this.whatsapp.verificarNumero(empresa.whatsapp);
    if (!numeroValido) {
      logger.warn(`⚠️  Número inválido no WhatsApp: ${empresa.whatsapp}`);
      await db.atualizarStatus(lead.id, 'numero_invalido');
      return;
    }

    // Construir e enviar mensagem
    const mensagem = this.builder.construirMensagemInicial(empresa, diagnostico);
    const resultado = await this.whatsapp.enviarMensagem(empresa.whatsapp, mensagem);

    if (resultado.sucesso) {
      await db.atualizarStatus(lead.id, 'contatado', { data_contato: new Date() });
      await db.registrarConversa(lead.id, 'enviado', mensagem);
      logger.info(`✅ Mensagem enviada: ${empresa.nome}`);
    }
  }

  async processarResposta(numero, mensagem) {
    logger.info(`📩 Resposta recebida de ${numero}: ${mensagem.substring(0, 50)}...`);

    const lead = await db.buscarLeadPorWhatsApp(numero);
    if (!lead) return;

    // Registrar resposta
    await db.registrarConversa(lead.id, 'recebido', mensagem);
    await db.atualizarStatus(lead.id, 'respondeu', { data_resposta: new Date() });

    // Classificar interesse
    const interesse = await this.builder.classificarInteresse(mensagem);
    logger.info(`🌡️  Interesse classificado: ${interesse}`);

    await db.atualizarStatus(lead.id, 'respondeu', { interesse });

    // Gerar resposta com IA
    const historico = lead.conversas || [];
    const resposta = await this.builder.gerarRespostaIA(historico, mensagem, lead);
    
    // Enviar resposta
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
    await this.whatsapp.enviarMensagem(numero, resposta);
    await db.registrarConversa(lead.id, 'enviado', resposta);

    // Se quente, atualizar para agendado quando detectar link
    if (interesse === 'quente') {
      await db.atualizarStatus(lead.id, 'quente', { interesse: 'quente' });
    }
  }

  delayHumano() {
    const base = parseInt(process.env.DELAY_ENTRE_MENSAGENS) || 45000;
    const variacao = base * 0.4;
    return base + (Math.random() * variacao * 2 - variacao);
  }

  dentroDoHorario() {
    const agora = new Date();
    const hora = agora.getHours();
    const [hInicio] = (process.env.HORARIO_INICIO || '08:00').split(':').map(Number);
    const [hFim] = (process.env.HORARIO_FIM || '18:00').split(':').map(Number);
    const diaSemana = agora.getDay();
    return hora >= hInicio && hora < hFim && diaSemana >= 1 && diaSemana <= 5;
  }

  pausar() { this.ativo = false; }
}
