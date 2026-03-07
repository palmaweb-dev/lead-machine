import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class MessageBuilder {

  limitarRespostaWhatsApp(texto) {
    if (!texto) return '';

    const linhas = texto
      .split(/\n+/)
      .map(linha => linha.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean);

    const frases = linhas.flatMap(linha => {
      const partes = linha.match(/[^.!?]+[.!?]?/g) || [];
      return partes.map(parte => parte.trim()).filter(Boolean);
    });

    const unicas = [];
    const vistos = new Set();

    for (const frase of frases) {
      const chave = frase
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!chave || vistos.has(chave)) continue;

      vistos.add(chave);
      unicas.push(frase);

      if (unicas.length >= 3) break;
    }

    if (!unicas.length) {
      return 'Entendi. Como posso te ajudar?';
    }

    return unicas.join('\n');
  }

  normalizarTextoWhatsApp(texto) {
    if (!texto) return texto;

    return texto.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
      const labelLimpo = label.trim();
      return labelLimpo === url ? url : `${labelLimpo}: ${url}`;
    });
  }
  
  construirMensagemInicial(lead, diagnostico) {
    const empresa = lead.nome_empresa;

    // Escolher observação mais impactante
    const problema = diagnostico?.problemas?.[0] || 
                     'a presença digital pode estar mais otimizada';

    const observacoes = {
      'Não é responsivo para mobile': 
        `o site não está adaptado para celular — onde a maioria dos seus clientes provavelmente pesquisa`,
      'Sem botão de WhatsApp': 
        `não encontrei um botão de WhatsApp no site, o que pode estar dificultando o contato imediato`,
      'Site com design desatualizado': 
        `o site tem um design que pode transmitir uma imagem desatualizada do negócio`,
      'Sem certificado SSL (HTTP)': 
        `o site não tem certificado de segurança, o que afasta visitantes e prejudica o Google`,
      'Carregamento lento (+5s)': 
        `o site demora para carregar, e estudos mostram que 53% dos usuários abandonam após 3 segundos`,
    };

    const observacao = observacoes[problema] || 
      `identifiquei alguns pontos que podem estar limitando a captação de clientes`;

    // Variar levemente a abertura para não parecer robótico
    const aberturas = [
      `Olá! Pesquisando empresas do segmento de ${lead.segmento || 'vocês'}, acabei chegando no site da ${empresa}.`,
      `Oi! Estava analisando a presença digital de algumas empresas da região e o site da ${empresa} apareceu para mim.`,
      `Olá! Cheguei no site da ${empresa} durante uma pesquisa que fiz hoje.`
    ];

    const abertura = aberturas[Math.floor(Math.random() * aberturas.length)];

    return `${abertura}

Notei que ${observacao}. Esse é um ponto que pode impactar diretamente na geração de clientes online.

Posso te apresentar um diagnóstico completo em uma Sessão Estratégica gratuita, onde analiso sua presença digital e te mostro, com clareza, os pontos de melhoria e oportunidades de crescimento.`;
  }

  async gerarRespostaIA(historico, ultimaMensagem, lead) {
    const prompt = `Você é um consultor de marketing digital simpático e objetivo.
Seu nome é Eduardo e você sempre se apresenta como Eduardo quando fizer sentido no contexto.
Nunca use placeholders como [Seu nome], [Nome] ou variações.
Você está prospectando ${lead.nome_empresa} (segmento: ${lead.segmento || 'empresa'}).
Seu objetivo é conseguir uma reunião online gratuita de diagnóstico.
Link de agendamento: ${process.env.CALENDLY_LINK}

Histórico da conversa:
${historico.map(m => `${m.direcao === 'enviado' ? 'Você' : 'Cliente'}: ${m.mensagem}`).join('\n')}

Última mensagem do cliente: "${ultimaMensagem}"

Responda de forma natural, breve (máximo 3 parágrafos curtos), sem exagerar na formalidade.
Se detectar interesse real, ofereça o link de agendamento.
Se houver objeção, contorne com empatia.
Regras obrigatórias de formato para WhatsApp:
- Responda com no máximo 3 frases curtas.
- Cada frase deve ter apenas 1 ideia.
- Evite repetir a mesma informação com palavras diferentes.
- Para perguntas simples, use 1 ou 2 frases.
- Não use listas, bullets ou múltiplas interpretações da pergunta.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    const conteudo = response.choices[0].message.content;
    const normalizado = this.normalizarTextoWhatsApp(conteudo);
    return this.limitarRespostaWhatsApp(normalizado);
  }

  async classificarInteresse(mensagem) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: `Classifique o interesse nesta mensagem como: quente, morno ou frio.
Mensagem: "${mensagem}"
Responda apenas uma palavra.`
      }]
    });

    const classificacao = response.choices[0].message.content.toLowerCase().trim();
    if (classificacao.includes('quente')) return 'quente';
    if (classificacao.includes('morno')) return 'morno';
    return 'frio';
  }
}
