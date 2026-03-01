import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export const db = {

  // =============================
  // SALVAR LEAD
  // =============================
  async salvarLead(empresa) {
    try {
      const payload = {
        nome_empresa: empresa.nome_empresa,
        whatsapp: empresa.whatsapp || null,
        site: empresa.site || null,
        cidade: empresa.cidade || null,
        segmento: empresa.segmento || null,
        status: 'novo',
        created_at: new Date().toISOString()
      };

      const { data, error } = await sb
        .from('leads')
        .upsert(payload, { onConflict: 'whatsapp', ignoreDuplicates: false })
        .select()
        .single();

      if (error) {
        logger.error(`❌ Erro salvarLead: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      logger.error(`❌ salvarLead exception: ${err.message}`);
      return null;
    }
  },


  // =============================
  // BUSCAR LEAD PELO WHATSAPP
  // =============================
  async buscarLeadPorWhatsApp(numero) {
    try {
      const { data, error } = await sb
        .from('leads')
        .select(`
          *,
          diagnosticos(*),
          conversas(direcao, mensagem, created_at)
        `)
        .eq('whatsapp', numero)
        .single();

      if (error) return null;
      return data;
    } catch {
      return null;
    }
  },


  // =============================
  // SALVAR DIAGNÓSTICO
  // =============================
  async salvarDiagnostico(leadId, diagnostico) {
    try {
      if (!diagnostico) return null;

      const payload = {
        lead_id: leadId,
        score: diagnostico.score || 0,
        problemas: diagnostico.problemas || [],
        created_at: new Date().toISOString()
      };

      const { data, error } = await sb
        .from('diagnosticos')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error(`❌ Erro salvarDiagnostico: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      logger.error(`❌ salvarDiagnostico exception: ${err.message}`);
      return null;
    }
  },


  // =============================
  // ATUALIZAR STATUS
  // =============================
  async atualizarStatus(leadId, status, dados = {}) {
    try {
      const payload = {
        status,
        ...dados,
        updated_at: new Date().toISOString()
      };

      const { error } = await sb
        .from('leads')
        .update(payload)
        .eq('id', leadId);

      if (error) {
        logger.error(`❌ atualizarStatus: ${error.message}`);
        return false;
      }

      return true;
    } catch (err) {
      logger.error(`❌ atualizarStatus exception: ${err.message}`);
      return false;
    }
  },


  // =============================
  // REGISTRAR CONVERSA
  // =============================
  async registrarConversa(leadId, direcao, mensagem) {
    try {
      const payload = {
        lead_id: leadId,
        direcao,
        mensagem,
        created_at: new Date().toISOString()
      };

      const { error } = await sb
        .from('conversas')
        .insert(payload);

      if (error) {
        logger.error(`❌ registrarConversa: ${error.message}`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  },


  // =============================
  // LEADS PENDENTES
  // =============================
  async pendentes(lim = 40) {
    try {
      const { data } = await sb
        .from('leads')
        .select('*')
        .eq('status', 'novo')
        .not('whatsapp', 'is', null)
        .limit(lim);

      return data || [];
    } catch {
      return [];
    }
  },


  // =============================
  // LISTAR
  // =============================
  async listar(pag = 0, tamanhoPagina = 30) {
    try {
      const paginaAtual = Number.isInteger(pag) && pag >= 0 ? pag : 0;
      const limite = Number.isInteger(tamanhoPagina) && tamanhoPagina > 0
        ? Math.min(tamanhoPagina, 100)
        : 30;

      const { data, count } = await sb
        .from('leads')
        .select('*, diagnosticos(score, problemas)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(paginaAtual * limite, paginaAtual * limite + (limite - 1));

      return {
        leads: data || [],
        total: count || 0,
        pagina: paginaAtual,
        por_pagina: limite,
        total_paginas: Math.max(1, Math.ceil((count || 0) / limite))
      };
    } catch {
      return {
        leads: [],
        total: 0,
        pagina: 0,
        por_pagina: 30,
        total_paginas: 1
      };
    }
  },


  // =============================
  // MÉTRICAS
  // =============================
  async metricas() {
    try {
      const hoje = new Date().toISOString().split('T')[0];

      const q = () =>
        sb.from('leads').select('*', { count: 'exact', head: true });

      const [a, b, c, d] = await Promise.all([
        q().then(r => r.count || 0),
        q().gte('data_contato', hoje).then(r => r.count || 0),
        q().gte('data_resposta', hoje).then(r => r.count || 0),
        q().eq('reuniao_agendada', true).then(r => r.count || 0)
      ]);

      return {
        total_leads: a,
        enviados_hoje: b,
        responderam_hoje: c,
        reunioes_hoje: d,
        taxa_resposta: b > 0
          ? ((c / b) * 100).toFixed(1) + '%'
          : '0%'
      };
    } catch {
      return {
        total_leads: 0,
        enviados_hoje: 0,
        responderam_hoje: 0,
        reunioes_hoje: 0,
        taxa_resposta: '0%'
      };
    }
  }

};
