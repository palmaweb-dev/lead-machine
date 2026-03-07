import { createClient } from '@supabase/supabase-js'
import { logger } from '../utils/logger.js'

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

function limparNumero(numero) {

  if (!numero) return null

  return numero
    .replace('@s.whatsapp.net','')
    .replace(/\D/g,'')
}

export const db = {

  // =============================
  // SALVAR LEAD
  // =============================

  async salvarLead(emp) {

    try {

      const numero = limparNumero(emp.whatsapp)

      const { data: existente } = await sb
        .from('leads')
        .select('*')
        .eq('whatsapp', numero)
        .maybeSingle()

      if (existente) return existente

      const { data, error } = await sb
        .from('leads')
        .insert({
          nome_empresa: emp.nome_empresa,
          whatsapp: numero,
          site: emp.site,
          segmento: emp.segmento,
          cidade: emp.cidade,
          status: 'novo'
        })
        .select()
        .single()

      if (error) {

        logger.error(error.message)

        return null

      }

      return data

    } catch (err) {

      logger.error(err.message)

      return null

    }

  },

  // =============================
  // BUSCAR LEAD POR WHATSAPP
  // =============================

  async buscarLeadPorWhatsapp(numero) {

    try {

      const numeroLimpo = limparNumero(numero)

      const { data, error } = await sb
        .from('leads')
        .select('*')
        .ilike('whatsapp', `%${numeroLimpo}`)
        .limit(1)
        .maybeSingle()

      if (error) {

        logger.error(error.message)

        return null

      }

      return data || null

    } catch (err) {

      logger.error(err.message)

      return null

    }

  },

  // =============================
  // ATUALIZAR LEAD
  // =============================

  async update(id, campos) {

    try {

      const { error } = await sb
        .from('leads')
        .update(campos)
        .eq('id', id)

      if (error) logger.error(error.message)

    } catch (err) {

      logger.error(err.message)

    }

  },

  // =============================
  // SALVAR DIAGNOSTICO
  // =============================

  async salvarDiag(leadId, analise) {

    try {

      const { data, error } = await sb
        .from('diagnosticos')
        .insert({
          lead_id: leadId,
          score: analise.score,
          problemas: analise.problemas,
          whatsapp_encontrado: analise.whatsapp_encontrado
        })
        .select()
        .single()

      if (error) {

        logger.error(error.message)

        return null

      }

      return data

    } catch (err) {

      logger.error(err.message)

      return null

    }

  },

  // =============================
  // BUSCAR DIAGNOSTICO
  // =============================

  async buscarDiagnostico(leadId) {

    try {

      const { data, error } = await sb
        .from('diagnosticos')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {

        logger.error(error.message)

        return null

      }

      return data || null

    } catch (err) {

      logger.error(err.message)

      return null

    }

  },

  // =============================
  // SALVAR MENSAGEM
  // =============================

  async msg(leadId, tipo, mensagem) {

    try {

      const { error } = await sb
        .from('conversas')
        .insert({
          lead_id: leadId,
          tipo,
          mensagem
        })

      if (error) logger.error(error.message)

    } catch (err) {

      logger.error(err.message)

    }

  },

  // =============================
  // BUSCAR CONVERSAS
  // =============================

  async buscarConversas(leadId) {

    try {

      const { data, error } = await sb
        .from('conversas')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at')

      if (error) {

        logger.error(error.message)

        return []

      }

      return data || []

    } catch (err) {

      logger.error(err.message)

      return []

    }

  },

  // =============================
  // BUSCAR FOLLOWUP
  // =============================

  async buscarParaFollowUp() {

    try {

      const { data, error } = await sb
        .from('leads')
        .select('*')
        .eq('status', 'contatado')

      if (error) {

        logger.error(error.message)

        return []

      }

      return data || []

    } catch (err) {

      logger.error(err.message)

      return []

    }

  },

  // =============================
  // LISTAR LEADS
  // =============================

  async listar(pagina = 0) {

    try {

      const { data } = await sb
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pagina * 50, pagina * 50 + 49)

      return data || []

    } catch {

      return []

    }

  },

  // =============================
  // METRICAS
  // =============================

  async metricas() {

    try {

      const { count: total } = await sb
        .from('leads')
        .select('*', { count: 'exact', head: true })

      const { count: contatados } = await sb
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'contatado')

      return {
        total: total || 0,
        contatados: contatados || 0
      }

    } catch {

      return {
        total: 0,
        contatados: 0
      }

    }

  }

}
