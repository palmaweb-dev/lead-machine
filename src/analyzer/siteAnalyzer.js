import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class SiteAnalyzer {
  async analisar(url) {
    if (!url?.startsWith('http')) return this.vazio('URL inválida');

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const tempo = Date.now() - t0;
      const html = await page.content();
      const $ = cheerio.load(html);

      const dom = await page.evaluate(() => ({
        temWhatsapp: Array.from(document.querySelectorAll('a[href]'))
          .some(a => /wa\.me|whatsapp/.test(a.href)),
        temFormulario: document.querySelectorAll('form').length > 0,
        temSSL: location.protocol === 'https:',
        temMeta: !!document.querySelector('meta[name="description"]'),
        temH1: document.querySelectorAll('h1').length > 0,
        temViewport: !!document.querySelector('meta[name="viewport"]')
      }));

      // Extrair número de WhatsApp do HTML
      let wpNumero = null;
      $('a[href*="wa.me"]').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/wa\.me\/(\d{10,15})/);
        if (m && !wpNumero) wpNumero = m[1];
      });

      const antigo = this.detectarAntigo($, html);
      const problemas = [];
      let score = 100;

      if (antigo)           { score -= 25; problemas.push('Design desatualizado'); }
      if (!dom.temViewport) { score -= 20; problemas.push('Não adaptado para celular'); }
      if (!dom.temSSL)      { score -= 15; problemas.push('Sem HTTPS/SSL'); }
      if (!dom.temWhatsapp) { score -= 15; problemas.push('Sem botão de WhatsApp'); }
      if (!dom.temFormulario){ score -= 10; problemas.push('Sem formulário de contato'); }
      if (!dom.temMeta)     { score -= 10; problemas.push('Sem meta description (SEO)'); }
      if (!dom.temH1)       { score -= 5;  problemas.push('Sem H1'); }
      if (tempo > 5000)     { score -= 10; problemas.push(`Carregamento lento (${(tempo/1000).toFixed(1)}s)`); }

      const resumo = await this.diagnosticoIA(url, problemas, score);
      await browser.close();

      return {
        site_antigo: antigo,
        tem_whatsapp: dom.temWhatsapp,
        tem_formulario: dom.temFormulario,
        mobile_ok: dom.temViewport,
        seo_basico: dom.temMeta && dom.temH1,
        velocidade: tempo < 2000 ? 'rápido' : tempo < 5000 ? 'médio' : 'lento',
        whatsapp_encontrado: wpNumero,
        problemas,
        score: Math.max(score, 0),
        resumo_ia: resumo
      };
    } catch (e) {
      await browser.close();
      return this.vazio(e.message);
    }
  }

  detectarAntigo($, html) {
    let pts = 0;
    if (!$('meta[name="viewport"]').length) pts++;
    if ($('table[width]').length > 3) pts++;
    if ($('font').length > 2) pts++;
    if (/jquery[/-]1\./.test(html)) pts++;
    if (/bootstrap[/-]3\./.test(html)) pts++;
    return pts >= 2;
  }

  async diagnosticoIA(url, problemas, score) {
    if (!process.env.OPENAI_API_KEY || !problemas.length) return `Score: ${score}/100`;
    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini', max_tokens: 120,
        messages: [{ role: 'user', content:
          `Em 2 frases comerciais diretas, descreva o impacto desses problemas no site ${url} para uma proposta de venda:\nProblemas: ${problemas.join(', ')}\nScore: ${score}/100\nPortuguês informal, sem listas.`
        }]
      });
      return r.choices[0].message.content;
    } catch { return `Site com ${problemas.length} problemas digitais.`; }
  }

  vazio(motivo) {
    return {
      site_antigo: null, tem_whatsapp: false, tem_formulario: false,
      mobile_ok: null, seo_basico: false, velocidade: 'desconhecida',
      whatsapp_encontrado: null, problemas: [`Erro: ${motivo}`],
      score: 0, resumo_ia: 'Não foi possível analisar.'
    };
  }
}
