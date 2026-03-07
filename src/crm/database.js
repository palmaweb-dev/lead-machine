import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

export const db = {

  // =============================
  // SALVAR LEAD
  // =============================

  async salvarLead(emp) {

    const { data, error } = await sb
      .from('leads')
      .insert({
        nome_empresa: emp.nome_empresa,
        site: emp.site || null,
        whatsapp: emp.whatsapp || null,
        segmento: emp.segmento,
        cidade: emp.cidade,
        status: 'novo'
      })
      .select()

    if (error) {
      console.error(error)
      return null
    }

    return data?.[0] || null
  },


  // =============================
  // BUSCAR LEAD POR WHATSAPP
  // =============================

  async buscarLeadPorWhatsapp(numero) {

    try {

      const numeroLimpo = numero
        .replace('@s.whatsapp.net', '')
        .replace('+', '')
        .trim()

      const { data, error } = await sb
        .from('leads')
        .select('*')
        .eq('whatsapp', numeroLimpo)

      if (error) {
        console.error("Erro Supabase:", error)
        return null
      }

      if (!data || data.length === 0) {
        return null
      }

      return data[0]

    } catch (err) {
      console.error("Erro buscarLeadPorWhatsapp:", err)
      return null
    }

  },


  // =============================
  // UPDATE LEAD
  // =============================

  async update(id, dados) {

    const { error } = await sb
      .from('leads')
      .update(dados)
      .eq('id', id)

    if (error) console.error(error)

  },


  // =============================
  // SALVAR DIAGNÓSTICO
  // =============================

  async salvarDiag(leadId, analise) {

    const { data, error } = await sb
      .from('diagnosticos')
      .insert({
        lead_id: leadId,
        score: analise.score,
        problemas: analise.problemas,
        whatsapp_encontrado: analise.whatsapp_encontrado
      })
      .select()

    if (error) {
      console.error(error)
      return null
    }

    return data?.[0] || null

  },


  // =============================
  // BUSCAR DIAGNÓSTICO
  // =============================

  async buscarDiagnostico(leadId) {

    const { data, error } = await sb
      .from('diagnosticos')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return null
    }

    return data?.[0] || null

  },


  // =============================
  // SALVAR MENSAGEM
  // =============================

  async msg(leadId, tipo, mensagem) {

    const { error } = await sb
      .from('conversas')
      .insert({
        lead_id: leadId,
        tipo,
        mensagem
      })

    if (error) console.error(error)

  },


  // =============================
  // BUSCAR CONVERSAS
  // =============================

  async buscarConversas(leadId) {

    const { data, error } = await sb
      .from('conversas')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at')

    if (error) {
      console.error(error)
      return []
    }

    return data || []

  },


  // =============================
  // FOLLOW UPS
  // =============================

  async buscarParaFollowUp() {

    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('status', 'contatado')

    if (error) {
      console.error(error)
      return []
    }

    return data || []

  },


  // =============================
  // MÉTRICAS
  // =============================

  async metricas() {

    const { count } = await sb
      .from('leads')
      .select('*', { count: 'exact', head: true })

    return {
      leads: count || 0
    }

  },


  // =============================
  // LISTAR LEADS
  // =============================

  async listar(pagina = 0) {

    const limite = 20
    const inicio = pagina * limite

    const { data, error } = await sb
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .range(inicio, inicio + limite)

    if (error) {
      console.error(error)
      return []
    }

    return data || []

  }

}
