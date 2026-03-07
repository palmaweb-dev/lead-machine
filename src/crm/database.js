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

    try {

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
        .single()

      if (error) {

        // Lead já existe
        if (error.code === '23505') {

          const { data } = await sb
            .from('leads')
            .select('*')
            .eq('whatsapp', emp.whatsapp)
            .single()

          return data

        }

        console.error(error)
        return null

      }

      return data

    } catch (err) {

      console.error(err)
      return null

    }

  },

  // =============================
  // BUSCAR LEAD POR WHATSAPP
  // =============================
  async buscarLeadPorWhatsapp(numero) {

    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('whatsapp', numero)
      .single()

    if (error) {
      return null
    }

    return data

  },

  // =============================
  // ATUALIZAR LEAD
  // =============================
  async update(id, dados) {

    const { error } = await sb
      .from('leads')
      .update(dados)
      .eq('id', id)

    if (error) {
      console.error(error)
    }

  },

  // =============================
  // SALVAR DIAGNÓSTICO
  // =============================
  async salvarDiag(leadId, analise) {

    const { data } = await sb
      .from('diagnosticos')
      .insert({
        lead_id: leadId,
        score: analise.score,
        problemas: analise.problemas,
        whatsapp_encontrado: analise.whatsapp_encontrado
      })
      .select()
      .single()

    return data

  },

  // =============================
  // BUSCAR DIAGNÓSTICO
  // =============================
  async buscarDiagnostico(leadId) {

    const { data } = await sb
      .from('diagnosticos')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return data

  },

  // =============================
  // SALVAR MENSAGEM
  // =============================
  async msg(leadId, tipo, mensagem) {

    await sb
      .from('conversas')
      .insert({
        lead_id: leadId,
        tipo: tipo,
        mensagem: mensagem
      })

  },

  // =============================
  // BUSCAR CONVERSAS
  // =============================
  async buscarConversas(leadId) {

    const { data } = await sb
      .from('conversas')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at')

    return data || []

  },

  // =============================
  // BUSCAR FOLLOW UPS
  // =============================
  async buscarParaFollowUp() {

    const { data } = await sb
      .from('leads')
      .select('*')
      .eq('status', 'contatado')

    return data || []

  },

  // =============================
  // MÉTRICAS
  // =============================
  async metricas() {

    const { count } = await sb
      .from('leads')
      .select('*', { count: 'exact', head: true })

    const { count: enviados } = await sb
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'contatado')

    return {
      leads: count || 0,
      enviados: enviados || 0
    }

  },

  // =============================
  // LISTAR LEADS
  // =============================
  async listar(pagina = 0) {

    const limite = 20
    const inicio = pagina * limite

    const { data } = await sb
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .range(inicio, inicio + limite)

    return data || []

  }

}
