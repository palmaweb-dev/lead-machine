#!/bin/bash
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
echo -e "${CYAN}\n🧠 Atualizando bot — comportamento humano v3...\n${NC}"
cd /opt/lead-machine

# Backup
cp src/whatsapp/messageBuilder.js src/whatsapp/messageBuilder.v2.backup.js
cp src/automation/orchestrator.js src/automation/orchestrator.v2.backup.js
cp src/dashboard/server.js src/dashboard/server.v2.backup.js
echo -e "${GREEN}✓ Backups salvos${NC}"

# ── 1. MESSAGEBUILD ────────────────────────────────
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
    totalRespostas, isQuente, objecaoDetectada,
    isBot: PADROES_BOT.some(p => p.test(ultimaMensagem)),
    historicoPositivo: textoCompleto.includes('interesse') || textoCompleto.includes('sim') || textoCompleto.includes('pode'),
    jaOfertouLink: textoCompleto.includes(process.env.CALENDLY_LINK || 'calendly'),
  };
}

function buildSystemPrompt(lead, diagnostico, estagio, contexto) {
  const calendly = process.env.CALENDLY_LINK;
  const problemas = diagnostico?.problemas?.join(', ') || 'presença digital fraca';
  const score = diagnostico?.score ?? 'N/A';

  return `Você é Rafael, estrategista de marketing digital. Está conversando no WhatsApp.

EMPRESA: ${lead.nome_empresa}
SEGMENTO: ${lead.segmento || 'não identificado'}
PROBLEMAS NO SITE: ${problemas}
SCORE DIGITAL: ${score}/100
LINK AGENDAMENTO: ${calendly}

═══════════════════════════════════
REGRAS DE FORMATAÇÃO — CRÍTICO
═══════════════════════════════════
Você escreve como um humano no WhatsApp. Isso significa:

1. MENSAGENS CURTAS — máximo 2 linhas por bloco
   ✅ "Entendi! O problema é bem comum em clínicas."
   ✅ "Basicamente o site não aparece quando alguém pesquisa no Google."
   ❌ "Com base no diagnóstico que realizei, identificamos diversos pontos de melhoria..."

2. DIVIDA EM PARTES — use [PAUSA] para separar cada parte da mensagem
   Exemplo de resposta bem formatada:
   "Entendi!"
   [PAUSA]
   "O que acontece é que o site da *${lead.nome_empresa}* não está aparecendo no Google quando alguém pesquisa ${lead.segmento || 'sua área'} na cidade."
   [PAUSA]
   "Você sabia disso?"

3. NUNCA escreva blocos longos — quebre tudo em partes pequenas separadas por [PAUSA]

4. LINGUAGEM NATURAL:
   ✅ "boa", "faz sentido", "entendi", "olha", "é que..."
   ❌ "com certeza!", "ótima pergunta!", "absolutamente!", "claro que sim!"
   ❌ Listas com bullet points ou números
   ❌ Negrito excessivo

5. UMA pergunta por vez — no máximo. Nunca duas.

═══════════════════════════════════
OBJETIVO
═══════════════════════════════════
Agendar uma Sessão Estratégica gratuita de 30 minutos.
S� ofereça o link depois de 2 trocas positivas OU sinal claro de interesse.

ESTÁGIO:
- Respostas do lead: ${estagio.totalRespostas}
- Interesse: ${estagio.isQuente ? 'QUENTE 🔥' : 'MORNO/FRIO'}
- Objeção: ${estagio.objecaoDetectada || 'nenhuma'}
- Link já enviado: ${estagio.jaOfertouLink ? 'SIM — não enviar de novo' : 'NÃO'}
${contexto}

═══════════════════════════════════
COMO REBATER OBJEÇÕES
═══════════════════════════════════
"Vou pensar"
→ "Claro, sem pressa!"
[PAUSA]
"Só por curiosidade — o que te deixaria mais confortável pra dar um próximo passo?"

"Já tenho agência"
→ "Faz sentido ter alguém!"
[PAUSA]
"Você tem acompanhado os resultados? Pergunto porque muita gente que atendo tem agência mas não vê crescimento concreto no digital."

"Sem orçamento / caro"
→ "A sessão é gratuita — sem pitch, sem proposta."
[PAUSA]
"É só eu te mostrar o que encontrei. Faz sentido?"

"Sem tempo"
→ "São só 30 minutos — você escolhe o dia e horário."
[PAUSA]
"Posso te mandar o link pra marcar quando fizer sentido?"

"Não preciso"
→ "Sem problema!"
[PAUSA]
"Se um dia quiser comparar o que tem hoje com o que é possível, é só falar."

"Como achou meu número?"
→ "Encontrei no Google pesquisando empresas do segmento."
[PAUSA]
"Nada invasivo — se preferir sem contato, é só falar e respeito."

"Não tenho interesse"
→ "Tudo bem, sem problema!"
[PAUSA]
"Se mudar de ideia o diagnóstico fica disponível. Bom trabalho!"

${estagio.isBot ? `
BOT ADVERSÁRIO DETECTADO — responda assim:
"Você poderia me conectar com o responsável pelo marketing ou com o(a) dono(a)?"
[PAUSA]
"Tenho algo específico sobre o site de vocês que queria compartilhar diretamente."` : ''}

REGRAS ABSOLUTAS:
- SEMPRE use [PAUSA] para separar partes da mensagem
- NUNCA escreva mais de 2 linhas sem um [PAUSA]
- NUNCA envie o link se já foi enviado
- NUNCA seja genérico — mencione a empresa ou segmento
- NUNCA faça mais de 1 pergunta por mensagem`;
}

// ══════════════════════════════════════════════
//  DIVIDIR RESPOSTA EM PARTES HUMANAS
// ══════════════════════════════════════════════
function dividirEmPartes(texto) {
  // Dividir pelo marcador [PAUSA]
  let partes = texto.split(/\[PAUSA\]/gi)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Se não tiver [PAUSA], dividir por parágrafos duplos
  if (partes.length === 1) {
    partes = texto.split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  // Limitar a 4 partes no máximo
  return partes.slice(0, 4);
}

export class MessageBuilder {

  async construirInicial(lead, diag) {
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

    const templatesDefault = [
      `Oi! Pesquisando empresas do segmento de ${segmento}, acabei chegando no site da *${empresa}*.\n\nNotei que ${observacao} — isso pode estar custando clientes sem que você perceba.\n\nFaço diagnósticos gratuitos pra esse tipo de situação. Posso te mostrar o que encontrei?`,
      `Olá! Vi o site da *${empresa}* enquanto fazia uma análise de empresas da região.\n\nNotei que ${observacao} — esse é um ponto que pode impactar diretamente na geração de clientes.\n\nPosso te apresentar um diagnóstico em uma Sessão Estratégica *gratuita*?`,
      `Oi! Estava analisando a presença digital de algumas empresas e o site da *${empresa}* apareceu pra mim.\n\nNotei que ${observacao}.\n\nPosso te mostrar o que encontrei? É gratuito e sem compromisso.`,
    ];

    let templates = templatesDefault;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sbLocal = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      const { data } = await sbLocal.from('configuracoes').select('valor').eq('id', 'mensagens_prospeccao').single();
      if (data?.valor?.templates?.length > 0) {
        const calendly = process.env.CALENDLY_LINK || '';
        templates = data.valor.templates.map(t =>
          t.replace(/\{empresa\}/g, empresa)
           .replace(/\{problema\}/g, problema || observacao)
           .replace(/\{segmento\}/g, segmento)
           .replace(/\{cidade\}/g, lead.cidade || '')
           .replace(/\{score\}/g, diag?.score ?? '')
           .replace(/\{calendly\}/g, calendly)
        );
      }
    } catch { /* usa templates padrão */ }

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

  // Gera resposta e retorna ARRAY de partes para envio sequencial
  async gerarRespostaEmPartes(conversas, novaMensagem, lead, diagnostico) {
    const estagio = detectarEstagio(conversas || [], novaMensagem);
    const totalEnviados = (conversas || []).filter(m => m.direcao === 'enviado').length;

    const contexto = `
INSTRUÇÃO DE TIMING:
${estagio.isQuente && !estagio.jaOfertouLink
  ? '→ MOMENTO CERTO para oferecer agendamento. Use [PAUSA] entre as partes.'
  : estagio.jaOfertouLink
  ? '→ Link JÁ ENVIADO. Não envie de novo. Pergunte se teve chance de ver.'
  : estagio.totalRespostas >= 2 && estagio.historicoPositivo
  ? '→ Conversa positiva. Comece a conduzir ao agendamento com [PAUSA].'
  : '→ Continue construindo rapport. Use [PAUSA] para dividir a resposta.'}
${estagio.objecaoDetectada ? `\nOBJEÇÃO: "${estagio.objecaoDetectada}" — use a técnica correspondente com [PAUSA].` : ''}
MENSAGENS ENVIADAS: ${totalEnviados}`;

    const historico = (conversas || []).map(m => ({
      role: m.direcao === 'enviado' ? 'assistant' : 'user',
      content: m.mensagem
    }));

    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 400,
        temperature: 0.85,
        messages: [
          { role: 'system', content: buildSystemPrompt(lead, diagnostico, estagio, contexto) },
          ...historico,
          { role: 'user', content: novaMensagem }
        ]
      });

      const textoCompleto = r.choices[0].message.content.trim();
      return { partes: dividirEmPartes(textoCompleto), estagio };

    } catch {
      return { partes: [this.respostaFallback(estagio)], estagio };
    }
  }

  // Mantido para compatibilidade
  async gerarResposta(conversas, novaMensagem, lead, diagnostico) {
    const { partes } = await this.gerarRespostaEmPartes(conversas, novaMensagem, lead, diagnostico);
    return partes.join('\n\n');
  }

  respostaFallback(estagio) {
    const calendly = process.env.CALENDLY_LINK;
    if (estagio.isQuente && !estagio.jaOfertouLink) {
      return `Que bom!\n\nVou te mandar o link pra escolher o melhor horário — 30 min, sem compromisso:\n\n${calendly}`;
    }
    if (estagio.objecaoDetectada === 'sem_tempo') {
      return `Sem problema!\n\nQuando tiver um tempinho, é só me dar um sinal. Você escolhe o horário.`;
    }
    return `Faz sentido!\n\nPosso te mostrar numa conversa rápida de 30 minutos — totalmente gratuita. Teria um tempinho essa semana?`;
  }

  async gerarFollowUp(lead, conversas, diagnostico, tentativa = 1) {
    const empresa = lead.nome_empresa;
    const problema = diagnostico?.problemas?.[0] || 'presença digital';
    const calendly = process.env.CALENDLY_LINK;

    const followUps = {
      1: `Oi! Sei que o dia a dia é corrido.\n\nSó passando pra ver se você teve chance de ver minha mensagem sobre o site da *${empresa}*. Sem pressão!`,
      2: `Oi! Fiz a análise completa do site da *${empresa}* e encontrei ${diagnostico?.problemas?.length || 'alguns'} pontos que podem estar reduzindo clientes.\n\nSe quiser ver, são 30 minutos e totalmente gratuito:\n${calendly}`,
      3: `Última mensagem, prometo! 😄\n\nCaso um dia queira ver o diagnóstico da *${empresa}*, fico à disposição. Bom trabalho pra você!`,
    };

    if (process.env.OPENAI_API_KEY && tentativa <= 2) {
      try {
        const r = await openai.chat.completions.create({
          model: 'gpt-4o-mini', max_tokens: 120, temperature: 0.8,
          messages: [{ role: 'user', content:
            `Follow-up de WhatsApp tentativa ${tentativa}/3 para ${empresa} (${lead.segmento || 'empresa'}).\nProblema: ${problema}. Link: ${calendly}.\nRegras: 2-3 linhas curtas, não invasivo, informal.\n${tentativa === 1 ? 'Verificar se viu a mensagem.' : 'Reforçar valor gratuito.'}\nUse quebras de linha naturais.`
          }]
        });
        return r.choices[0].message.content.trim();
      } catch { /* fallback */ }
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

# ── 2. ORCHESTRATOR — envio em partes com digitando ──
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

  // ─────────────────────────────────────────────
  //  ENVIO EM PARTES — comportamento humano
  // ─────────────────────────────────────────────
  async enviarEmPartes(numero, partes) {
    const resultados = [];

    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      if (!parte.trim()) continue;

      // Delay entre partes (simula pessoa pensando e digitando)
      if (i > 0) {
        const pausaMs = 4000 + Math.random() * 6000; // 4-10s entre partes
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

  // ─────────────────────────────────────────────
  //  CICLO DE PROSPECÇÃO
  // ─────────────────────────────────────────────
  async executarCiclo({ segmento, cidade, limite = 20 }) {
    if (!this.horarioOk()) { logger.info('⏰ Fora do horário.'); return; }

    logger.info(`\n${'═'.repeat(55)}\n🚀 PROSPECÇÃO: ${segmento} | ${cidade} | ${limite} leads\n${'═'.repeat(55)}`);
    this.ativo = true;
    this.stats = { processados: 0, enviados: 0, erros: 0 };

    try {
      await this.scraper.init();
      const empresas = await this.scraper.buscarEmpresas(segmento, cidade, limite);
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
      if (!valido) { await db.update(lead.id, { status: 'numero_invalido' }); return; }

      const msg = await this.builder.construirInicial(lead, diag);
      const ok  = await this.whatsapp.enviarMensagem(lead.whatsapp, msg);

      if (ok.sucesso) {
        await db.update(lead.id, { status: 'contatado', data_contato: new Date() });
        await db.msg(lead.id, 'enviado', msg);
        this.stats.enviados++;
        logger.info(`  ✅ Enviado!`);
      } else { this.stats.erros++; }
    } finally {
      setTimeout(() => this._enviandoPara.delete(lead.whatsapp), 60000);
    }
  }

  // ─────────────────────────────────────────────
  //  PROCESSAR RESPOSTA — envio em partes
  // ─────────────────────────────────────────────
  async processarResposta(numero, texto) {
    logger.info(`\n${'─'.repeat(50)}`);
    logger.info(`📩 RESPOSTA de ${numero}`);
    logger.info(`   "${texto.substring(0, 80)}${texto.length > 80 ? '...' : ''}"`);

    const lead = await db.porWhatsAppCompleto(numero);
    if (!lead) { logger.warn(`  ⚠️  Número não está na base`); return; }

    logger.info(`  🏢 ${lead.nome_empresa} | Status: ${lead.status}`);

    if (this.builder.ehMensagemDeStop(texto)) {
      logger.info(`  🚫 Lead pediu para parar`);
      await db.update(lead.id, { status: 'descartado' });
      await db.msg(lead.id, 'recebido', texto);
      await this.whatsapp.enviarMensagem(numero, `Entendido! Não entrarei mais em contato. Boa sorte! 👊`);
      return;
    }

    const ehBot = this.builder.detectarBot(texto);
    if (ehBot) {
      logger.info(`  🤖 Bot adversário detectado`);
      await db.update(lead.id, { status: 'bot_detectado' });
    }

    await db.msg(lead.id, 'recebido', texto);
    await db.update(lead.id, { status: 'respondeu', data_resposta: new Date() });

    const interesse = await this.builder.classificarInteresse(texto);
    await db.update(lead.id, { interesse });
    logger.info(`  🌡️  Interesse: ${interesse.toUpperCase()}`);

    // Delay inicial — simula pessoa vendo e pensando antes de começar a digitar
    const delayInicial = ehBot
      ? 3000 + Math.random() * 2000
      : 15000 + Math.random() * 35000; // 15-50s para parecer humano

    logger.info(`  ⏳ Iniciando resposta em ${(delayInicial/1000).toFixed(0)}s...`);
    await new Promise(r => setTimeout(r, delayInicial));

    // Gerar resposta em partes
    const diagnostico = lead.diagnosticos?.[0] || null;
    const historico   = lead.conversas || [];

    const { partes, estagio } = await this.builder.gerarRespostaEmPartes(
      historico, texto, lead, diagnostico
    );

    logger.info(`  💬 ${partes.length} parte(s) para enviar`);

    // Enviar em partes com delays entre elas
    const sucesso = await this.enviarEmPartes(numero, partes);

    if (sucesso) {
      const textoCompleto = partes.join('\n\n');
      await db.msg(lead.id, 'enviado', textoCompleto);

      if (textoCompleto.includes(process.env.CALENDLY_LINK || 'calendly')) {
        await db.update(lead.id, { status: 'link_enviado' });
        logger.info(`  🔗 Link de agendamento enviado!`);
      }
    }

    if (interesse === 'quente') await db.update(lead.id, { status: 'quente' });
    else if (interesse === 'frio') await db.update(lead.id, { status: 'frio' });
  }

  // ─────────────────────────────────────────────
  //  FOLLOW-UP
  // ─────────────────────────────────────────────
  async executarFollowUp() {
    if (!this.horarioOk()) return;
    logger.info('\n🔄 Follow-ups...');
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
    if (process.env.ALLOW_WEEKENDS !== 'true' && (d === 0 || d === 6)) return false;
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

# ── 3. CORRIGIR PayloadTooLargeError no server.js ──
sed -i 's/app.use(express.json());/app.use(express.json({ limit: "10mb" }));\napp.use(express.urlencoded({ extended: true, limit: "10mb" }));/' src/dashboard/server.js
echo -e "${GREEN}✓ server.js — limite de payload corrigido (10mb)${NC}"

# ── 4. Reiniciar ──
pm2 restart lead-machine --update-env
sleep 3
pm2 status

echo -e "\n${GREEN}╔══════════════════════════════════════════════╗"
echo -e "║  ✅  Bot v3 atualizado com sucesso!          ║"
echo -e "║                                              ║"
echo -e "║  Melhorias aplicadas:                        ║"
echo -e "║  ✓ Mensagens curtas e divididas em partes    ║"
echo -e "║  ✓ Delay de 15-50s antes de responder        ║"
echo -e "║  ✓ Pausa de 4-10s entre cada parte           ║"
echo -e "║  ✓ Prompt reformulado — mais humano          ║"
echo -e "║  ✓ PayloadTooLargeError corrigido            ║"
echo -e "╚══════════════════════════════════════════════╝${NC}\n"
