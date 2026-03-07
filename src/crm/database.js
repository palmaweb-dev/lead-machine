import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export const db = {

  async salvarLead(d) {
    const { data, error } = await sb.from('leads')
      .upsert({
        nome_empresa: d.nome_empresa, site: d.site || null,
        telefone: d.telefone || null, whatsapp: d.whatsapp || null,
        endereco: d.endereco || null, cidade: d.cidade || null,
        segmento: d.segmento || null, avaliacoes: d.avaliacoes || null,
        status: 'novo'
      }, { onConflict: 'whatsapp' }).select().single();
    if (error) logger.error(`DB salvarLead: ${error.message}`);
    return data;
  },

async salvarDiag(leadId, d) {
  // Campos permitidos na tabela diagnosticos
  const campos = {
    lead_id: leadId,
    score: d.score,
    problemas: d.problemas,
    resumo_ia: d.resumo_ia,
    site_antigo: d.site_antigo,
    tem_whatsapp: d.tem_whatsapp,
    tem_formulario: d.tem_formulario,
    mobile_ok: d.mobile_ok,
    seo_basico: d.seo_basico,
    velocidade: d.velocidade,
    whatsapp_encontrado: d.whatsapp_encontrado,
  };
  // Remover campos undefined/null para evitar erros no Supabase
  Object.keys(campos).forEach(k => (campos[k] === undefined || campos[k] === null) && k !== "lead_id" && k !== "score" && delete campos[k]);
  const { data, error } = await sb.from('diagnosticos')
    .insert(campos).select().single();
  if (error) logger.error(`DB salvarDiag erro: ${error.message}`);
  return data;
},

  async update(id, campos) {
    await sb.from('leads')
      .update({ ...campos, updated_at: new Date() })
      .eq('id', id);
  },

  async msg(leadId, dir, texto) {
    await sb.from('conversas').insert({
      lead_id: leadId, direcao: dir, mensagem: texto
    });
  },

  // Busca lead com histórico COMPLETO e diagnóstico — usado no webhook
  async porWhatsAppCompleto(numero) {
    const { data } = await sb.from('leads')
      .select(`
        *,
        diagnosticos ( score, problemas, resumo_ia, site_antigo, tem_whatsapp, mobile_ok ),
        conversas ( id, direcao, mensagem, created_at )
      `)
      .eq('whatsapp', numero)
      .order('created_at', { referencedTable: 'conversas', ascending: true })
      .single();
    return data;
  },

  async listar(pag = 0) {
    // Busca total para paginao
    const { count } = await sb.from('leads').select('*', { count: 'exact', head: true });
    // Busca diagnsticos ordenados por score desc para priorizar leads com score
    const { data: todasDiags } = await sb.from('diagnosticos')
      .select('lead_id, score, problemas')
      .order('score', { ascending: false });
    const diagMap = {};
    (todasDiags || []).forEach(d => { diagMap[d.lead_id] = d; });
    // Busca leads desta pgina ordenados por created_at
    const { data } = await sb.from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .range(pag * 50, pag * 50 + 49);
    const leads = data || [];
    // Mescla diagnostico em cada lead
    const leadsComDiag = leads.map(l => ({
      ...l,
      diagnosticos: diagMap[l.id] ? [diagMap[l.id]] : []
    }));
    return { leads: leadsComDiag, total: count || 0 };
  },

  async pendentes(lim = 40) {
    const { data } = await sb.from('leads').select('*')
      .eq('status', 'novo').not('whatsapp', 'is', null).limit(lim);
    return data || [];
  },

  // Leads contatados há mais de 48h sem resposta — para follow-up
  async buscarParaFollowUp() {
    const limite = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await sb.from('leads')
      .select('*')
      .eq('status', 'contatado')
      .not('whatsapp', 'is', null)
      .lt('data_contato', limite)
      .limit(20);
    return data || [];
  },

  async metricas() {
    const hoje = new Date().toISOString().split('T')[0];

    const results = await Promise.all([
      sb.from('leads').select('*', { count: 'exact', head: true }),
      sb.from('leads').select('*', { count: 'exact', head: true }).gte('data_contato', hoje),
      sb.from('leads').select('*', { count: 'exact', head: true }).gte('data_resposta', hoje),
      sb.from('leads').select('*', { count: 'exact', head: true }).eq('reuniao_agendada', true),
      sb.from('leads').select('*', { count: 'exact', head: true }).eq('interesse', 'quente'),
      sb.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'link_enviado'),
    ]);

    const [total, envHoje, respHoje, reunioes, quentes, linksEnviados] = results.map(r => r.count || 0);

    return {
      total_leads: total,
      enviados_hoje: envHoje,
      responderam_hoje: respHoje,
      reunioes_agendadas: reunioes,
      leads_quentes: quentes,
      links_enviados: linksEnviados,
      taxa_resposta: envHoje > 0 ? ((respHoje / envHoje) * 100).toFixed(1) + '%' : '0%'
    };
  }
};
