#!/bin/bash
# ══════════════════════════════════════════════════
#   LEAD MACHINE — Script de Atualização v2
#   Cole e execute na VPS: bash atualizar.sh
# ══════════════════════════════════════════════════

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${CYAN}\n🔄 Atualizando Lead Machine para v2...\n${NC}"

cd /opt/lead-machine

# ── Backup dos arquivos atuais ──────────────────
echo -e "${YELLOW}→ Fazendo backup dos arquivos atuais...${NC}"
cp src/whatsapp/messageBuilder.js src/whatsapp/messageBuilder.backup.js
cp src/automation/orchestrator.js src/automation/orchestrator.backup.js
echo -e "${GREEN}✓ Backup salvo${NC}"

# ── messageBuilder_v2 ───────────────────────────
echo -e "${YELLOW}→ Atualizando messageBuilder.js...${NC}"
cat > src/whatsapp/messageBuilder.js << 'EOF'
import { OpenAI } from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PADROES_BOT = [
  /obrigad[ao] por entrar em contato/i,
  /estou aqui para ajudar/i,
  /responderei o mais breve possível/i,
  /atendimento automático/i,
  /horário de atendimento/i,
  /fora do horário/i,
  /digite \d para/i,
  /selecione uma opção/i,
  /sua mensagem foi recebida/i,
  /aguarde.*atendente/i,
  /em breve retornaremos/i,
  /bot|chatbot|assistente virtual/i,
  /para falar com.*humano/i,
  /menu principal/i,
  /olá!.*obrigad/i,
];

function detectarEstagio(conversas, ultimaMensagem) {
  const totalRespostas = conversas.filter(m => m.direcao === 'recebido').length;
  const textoCompleto = conversas.map(m => m.mensagem).join(' ').toLowerCase();
  const ultima = ultimaMensagem.toLowerCase();

  const sinaisQuentes = [
    /quanto custa|qual o valor|qual o preço/i,
    /como funciona|me conta mais|me fala mais/i,
    /tenho interesse|pode me mandar|quero saber/i,
    /que horas|qual horário|quando podemos/i,
    /vamos marcar|pode ser|topo|bora/i,
    /me manda o link|como agendo|como marco/i,
  ];

  const objecoes = {
    sem_tempo:     /sem tempo|muito ocupad|agora não|depois|mais tarde|semana que vem/i,
    ja_tem:        /já ten(ho|ho)|já trabalho com|já tem alguém|já temos agência/i,
    sem_dinheiro:  /sem verba|sem orçamento|sem budget|não tenho dinheiro|caro|investimento/i,
    nao_precisa:   /não preciso|não precis|não vejo necessidade|tá bom assim/i,
    desconfianca:  /como você achou|quem é você|de onde|spam|golpe/i,
    pensando:      /vou pensar|deixa eu pensar|preciso avaliar|vou ver/i,
    nao_interessa: /não tenho interesse|não me interessa|não quero|pode parar/i,
  };

  const isQuente = sinaisQuentes.some(p => p.test(ultima));
  let objecaoDetectada = null;
  for (const [tipo, padrao] of Object.entries(objecoes)) {
    if (padrao.test(ultima)) { objecaoDetectada = tipo; break; }
  }

  return {
    totalRespostas,
    isQuente,
    objecaoDetectada,
    isBot: PADROES_BOT.some(p => p.test(ultimaMensagem)),
    historicoPositivo: textoCompleto.includes('interesse') || textoCompleto.includes('sim') || textoCompleto.includes('pode'),
    jaOfertouLink: textoCompleto.includes(process.env.CALENDLY_LINK || 'calendly'),
  };
}

function buildSystemPrompt(lead, diagnostico, estagio, contexto) {
  const calendly = process.env.CALENDLY_LINK;
  const problemas = diagnostico?.problemas?.join(', ') || 'presença digital fraca';
  const score = diagnostico?.score ?? 'N/A';

  return `Você é Rafael, estrategista sênior de marketing digital com 10 anos de experiência.
Você está conversando com um potencial cliente via WhatsApp.

EMPRESA PROSPECTADA: ${lead.nome_empresa}
SEGMENTO: ${lead.segmento || 'não identificado'}
PROBLEMAS ENCONTRADOS NO SITE: ${problemas}
SCORE DIGITAL: ${score}/100
LINK DE AGENDAMENTO: ${calendly}

SUA PERSONALIDADE:
- Estrategista consultivo — você educa antes de vender
- Tom: direto, empático, confiante. Nunca ansioso ou desesperado
- Linguagem: informal profissional. Como conversa entre colegas experientes
- NUNCA usa: "com certeza!", "ótima pergunta!", "absolutamente!", "claro!"
- NUNCA parece robótico ou usa listas em mensagens de WhatsApp
- Frases curtas. Parágrafos curtos. Máximo 3 parágrafos por mensagem
- Uma pergunta por mensagem no máximo

SEU ÚNICO OBJETIVO: Agendar uma Sessão Estratégica gratuita de 30 minutos

ESTÁGIO ATUAL DO LEAD:
- Respostas até agora: ${estagio.totalRespostas}
- Nível de interesse: ${estagio.isQuente ? 'QUENTE' : 'MORNO/FRIO'}
- Objeção detectada: ${estagio.objecaoDetectada || 'nenhuma'}
- Link já foi enviado: ${estagio.jaOfertouLink ? 'SIM — não enviar de novo' : 'NÃO'}
${contexto}

FRAMEWORK DE VENDAS:

1. SPIN SELLING — perguntas que fazem o lead perceber o problema:
   "Você sabe quantas pessoas acessam o site por mês e quantas entram em contato?"
   "Quando alguém pesquisa ${lead.segmento || 'sua área'} na sua cidade, seu site aparece?"

2. RAPPORT — espelhe o estilo do lead:
   - Lead formal → resposta mais estruturada
   - Lead informal ("blz", "obg") → resposta curta e descontraída

3. AUTORIDADE — demonstre experiência:
   "Esse padrão é bem comum nesse segmento — o site existe mas não converte"

4. QUEBRA DE OBJEÇÕES:
   "Vou pensar" → "Faz sentido! Só por curiosidade, o que te deixaria mais confortável pra dar um próximo passo?"
   "Já tenho agência" → "Você tem acompanhado os resultados? Pergunto porque muita gente que atendo tem agência mas não vê crescimento concreto."
   "Sem orçamento" → "A sessão é gratuita — sem pitch, sem proposta. É só eu te mostrar o que encontrei."
   "Sem tempo" → "São 30 minutos, você escolhe o dia. Posso te mandar o link pra marcar quando fizer sentido?"
   "Não preciso" → "Sem problema! Fica o convite aberto. Se um dia quiser comparar, é só falar."
   "Como achou meu número?" → "Encontrei no Google pesquisando empresas do segmento — nada invasivo. Se preferir sem contato, é só falar."
   "Não tenho interesse" → "Tudo bem! Se mudar de ideia o diagnóstico fica disponível. Bom trabalho!"

5. CONDUÇÃO AO AGENDAMENTO:
   - Só envie o link após 2 interações positivas OU sinal quente claro
   - Se já enviou o link, não envie de novo — pergunte se teve chance de ver

${estagio.isBot ? `BOT ADVERSÁRIO DETECTADO:
Você está falando com um sistema automático.
Use: "Você poderia me conectar com o responsável pelo marketing ou com o(a) dono(a)? Tenho algo específico sobre o site de vocês."` : ''}

REGRAS ABSOLUTAS:
- NUNCA envie o link se já foi enviado antes nessa conversa
- NUNCA ignore o histórico — sempre leia antes de responder
- NUNCA seja genérico — mencione a empresa ou o segmento
- NUNCA use mais de 3 parágrafos
- NUNCA faça mais de 1 pergunta por mensagem
- Se pediu pra parar: agradeça e encerre com elegância`;
}

export class MessageBuilder {

  construirInicial(lead, diag) {
    const empresa = lead.nome_empresa;
    const segmento = lead.segmento || 'sua área';
    const problema = diag?.problemas?.[0] || '';

    const mapeamento = [
      { gatilho: 'celular',       obs: 'o site não está adaptado para celular — onde a maioria dos clientes pesquisa hoje' },
      { gatilho: 'WhatsApp',      obs: 'não tem botão de WhatsApp visível, o que dificulta o contato na hora certa' },
      { gatilho: 'desatualizado', obs: 'o design do site pode estar passando uma imagem desatualizada do negócio' },
      { gatilho: 'HTTPS',         obs: 'o site não tem certificado de segurança, o que afasta visitantes e prejudica no Google' },
      { gatilho: 'lento',         obs: 'o site demora pra carregar — acima de 3 segundos a maioria dos visitantes abandona' },
      { gatilho: 'SEO',           obs: 'encontrei problemas de SEO que estão reduzindo a visibilidade no Google' },
      { gatilho: 'formulário',    obs: 'não há uma forma clara de capturar o contato de quem visita o site' },
    ];

    let observacao = 'a presença digital pode estar limitando a geração de clientes';
    for (const { gatilho, obs } of mapeamento) {
      if (problema.toLowerCase().includes(gatilho.toLowerCase())) {
        observacao = obs; break;
      }
    }

    const templates = [
      `Oi! Pesquisando empresas do segmento de ${segmento}, acabei chegando no site da *${empresa}*.\n\nNotei que ${observacao} — isso pode estar custando clientes sem que você perceba.\n\nFaço diagnósticos gratuitos pra esse tipo de situação. Posso te mostrar o que encontrei?`,
      `Olá! Vi o site da *${empresa}* enquanto fazia uma análise de empresas da região.\n\nNotei que ${observacao} — esse é um ponto que pode impactar diretamente na geração de clientes online.\n\nPosso te apresentar um diagnóstico completo em uma Sessão Estratégica *gratuita*, onde analiso sua presença digital e te mostro os pontos de melhoria?`,
      `Oi! Estava analisando a presença digital de algumas empresas da região e o site da *${empresa}* apareceu pra mim.\n\nNotei que ${observacao}.\n\nTrabalho com posicionamento estratégico e acredito que consigo te mostrar melhorias práticas. Posso te mandar um diagnóstico gratuito?`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  detectarBot(mensagem) {
    return PADROES_BOT.some(p => p.test(mensagem));
  }

  async classificarInteresse(mensagem) {
    if (!process.env.OPENAI_API_KEY) return 'morno';
    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini', max_tokens: 5, temperature: 0,
        messages: [{ role: 'user', content:
          `Classifique: quente (quer avançar/perguntou como funciona/topou reunião), morno (respondeu mas neutro), frio (desinteressado/pediu pra parar).\nMensagem: "${mensagem}"\nUma palavra apenas.`
        }]
      });
      const t = r.choices[0].message.content.toLowerCase();
      return t.includes('quente') ? 'quente' : t.includes('frio') ? 'frio' : 'morno';
    } catch { return 'morno'; }
  }

  async gerarResposta(conversas, novaMensagem, lead, diagnostico) {
    const estagio = detectarEstagio(conversas || [], novaMensagem);
    const totalEnviados = (conversas || []).filter(m => m.direcao === 'enviado').length;

    const contexto = `
INSTRUÇÃO DE TIMING:
${estagio.isQuente && !estagio.jaOfertouLink
  ? '→ MOMENTO CERTO para oferecer o agendamento. Faça de forma natural.'
  : estagio.jaOfertouLink
  ? '→ Link JÁ FOI ENVIADO. Não envie de novo. Pergunte se teve chance de ver.'
  : estagio.totalRespostas >= 2 && estagio.historicoPositivo
  ? '→ Boa conversa estabelecida. Pode começar a conduzir para o agendamento.'
  : '→ Continue construindo rapport. Ainda não é hora do link.'}
${estagio.objecaoDetectada ? `\nOBJEÇÃO DETECTADA: "${estagio.objecaoDetectada}" — use a técnica correspondente.` : ''}
MENSAGENS JÁ ENVIADAS POR VOCÊ: ${totalEnviados}`;

    const historico = (conversas || []).map(m => ({
      role: m.direcao === 'enviado' ? 'assistant' : 'user',
      content: m.mensagem
    }));

    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 350,
        temperature: 0.85,
        messages: [
          { role: 'system', content: buildSystemPrompt(lead, diagnostico, estagio, contexto) },
          ...historico,
          { role: 'user', content: novaMensagem }
        ]
      });
      return r.choices[0].message.content.trim();
    } catch {
      return this.respostaFallback(estagio);
    }
  }

  respostaFallback(estagio) {
    const calendly = process.env.CALENDLY_LINK;
    if (estagio.isQuente && !estagio.jaOfertouLink) {
      return `Que bom! Vou te mandar o link pra você escolher o melhor horário — conversa rápida de 30 min, sem compromisso:\n\n${calendly}`;
    }
    if (estagio.objecaoDetectada === 'sem_tempo') {
      return `Sem problema! Quando tiver um tempinho, é só me dar um sinal. Você escolhe o horário.`;
    }
    return `Faz sentido! Posso te mostrar numa conversa rápida de 30 minutos — totalmente gratuita. Teria um tempinho essa semana?`;
  }

  async gerarFollowUp(lead, conversas, diagnostico, tentativa = 1) {
    const empresa = lead.nome_empresa;
    const problema = diagnostico?.problemas?.[0] || 'presença digital';
    const calendly = process.env.CALENDLY_LINK;

    const followUps = {
      1: `Oi! Sei que o dia a dia é corrido — só passando pra ver se você teve chance de ver minha mensagem sobre o site da *${empresa}*. Sem pressão, quando quiser conversar é só falar.`,
      2: `Oi! Fiz a análise completa do site da *${empresa}* e encontrei ${diagnostico?.problemas?.length || 'alguns'} pontos específicos que podem estar reduzindo clientes. Se quiser ver, são 30 minutos e totalmente gratuito:\n\n${calendly}`,
      3: `Última mensagem, prometo! 😄 Caso um dia queira ver o diagnóstico da *${empresa}*, fico à disposição. Bom trabalho pra você!`,
    };

    if (process.env.OPENAI_API_KEY && tentativa <= 2) {
      try {
        const r = await openai.chat.completions.create({
          model: 'gpt-4o-mini', max_tokens: 150, temperature: 0.8,
          messages: [{ role: 'user', content:
            `Escreva um follow-up de WhatsApp (tentativa ${tentativa} de 3) para ${empresa} no segmento ${lead.segmento || 'empresa'}.\nProblema encontrado: ${problema}.\nLink: ${calendly}.\nRegras: curto (max 3 linhas), não invasivo, não desesperado.\n${tentativa === 1 ? 'Só verificar se viu.' : 'Reforce o valor gratuito.'}\nPortuguês informal.`
          }]
        });
        return r.choices[0].message.content.trim();
      } catch { /* usa fallback */ }
    }
    return followUps[tentativa] || followUps[3];
  }

  ehMensagemDeStop(texto) {
    return [
      /não me (mande|envie|contate)/i,
      /me (tire|remova) da lista/i,
      /para de me (mandar|enviar)/i,
      /não tenho interesse/i,
      /stop|sair|descadastrar/i,
      /não quero mais contato/i,
      /pode parar/i,
    ].some(p => p.test(texto));
  }
}
EOF

echo -e "${GREEN}✓ messageBuilder.js atualizado${NC}"

# ── orchestrator_v2 ─────────────────────────────
echo -e "${YELLOW}→ Atualizando orchestrator.js...${NC}"
cat > src/automation/orchestrator.js << 'EOF'
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
      const empresas = await this.scraper.buscarEmpresas(segmento, cidade, limite);
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

      const msg = this.builder.construirInicial(lead, diag);
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

  async processarResposta(numero, texto) {
    logger.info(`\n${'─'.repeat(50)}`);
    logger.info(`📩 RESPOSTA de ${numero}: "${texto.substring(0, 80)}..."`);

    const lead = await db.porWhatsAppCompleto(numero);
    if (!lead) { logger.warn(`  ⚠️  Número não está na base`); return; }

    logger.info(`  🏢 ${lead.nome_empresa} | Status: ${lead.status}`);

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
EOF

echo -e "${GREEN}✓ orchestrator.js atualizado${NC}"

# ── Adicionar followup_count no banco ───────────
echo -e "${YELLOW}→ Nota: rode este SQL no Supabase SQL Editor:${NC}"
echo -e "   ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;"

# ── Reiniciar aplicação ──────────────────────────
echo -e "\n${YELLOW}→ Reiniciando Lead Machine...${NC}"
pm2 restart lead-machine --update-env
sleep 3
pm2 status

echo -e "\n${GREEN}╔══════════════════════════════════════════╗"
echo -e "║  ✅  Atualização concluída com sucesso!   ║"
echo -e "║                                          ║"
echo -e "║  O bot agora:                            ║"
echo -e "║  ✓ Lê todo o histórico da conversa       ║"
echo -e "║  ✓ Detecta e rebate objeções             ║"
echo -e "║  ✓ Detecta bots adversários              ║"
echo -e "║  ✓ Bloqueia mensagens duplicadas         ║"
echo -e "║  ✓ Follow-up inteligente em 3 etapas     ║"
echo -e "╚══════════════════════════════════════════╝${NC}\n"

echo -e "Monitorar logs: ${CYAN}pm2 logs lead-machine${NC}"
