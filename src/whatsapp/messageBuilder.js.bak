import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class MessageBuilder {
  
  construirMensagemInicial(lead, diagnostico) {
    const primeiroNome = lead.nome_empresa.split(' ')[0];
    
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

    return `Olá, tudo bem? 🙂

Realizei uma análise inicial da presença digital da *${lead.nome_empresa}* e ${observacao}.

Somos especializados em posicionamento digital estratégico para empresas como a sua e acredito que existem oportunidades claras de melhoria que podem aumentar significativamente a geração de clientes.

Posso te explicar melhor em uma sessão estratégica gratuita, onde mostro algumas oportunidades específicas para o seu negócio?`;
  }

  async gerarRespostaIA(historico, ultimaMensagem, lead) {
    const prompt = `Você é um consultor de marketing digital simpático e objetivo.
Você está prospectando ${lead.nome_empresa} (segmento: ${lead.segmento || 'empresa'}).
Seu objetivo é conseguir uma reunião online gratuita de diagnóstico.
Link de agendamento: ${process.env.CALENDLY_LINK}

Histórico da conversa:
${historico.map(m => `${m.direcao === 'enviado' ? 'Você' : 'Cliente'}: ${m.mensagem}`).join('\n')}

Última mensagem do cliente: "${ultimaMensagem}"

Responda de forma natural, breve (máximo 3 parágrafos curtos), sem exagerar na formalidade.
Se detectar interesse real, ofereça o link de agendamento.
Se houver objeção, contorne com empatia.
Não use listas, não use asteriscos excessivos.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.choices[0].message.content;
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
