import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';

export class MapsScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ]
    });

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1280, height: 800 }
    });

    this.page = await context.newPage();
    // Bloquear imagens e fontes para economizar memória/banda
    await this.page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', r => r.abort());
  }

  async buscarEmpresas({ segmento, cidade, limite = 20 }) {
    const keyword = segmento;
    const query = `${keyword} em ${cidade}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    logger.info(`🔍 Buscando: "${query}"`);

    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await this.page.waitForSelector('[role="feed"]', { timeout: 15000 });
    } catch {
      await this.page.waitForTimeout(3000);
    }

    const empresas = [];
    const vistos = new Set();
    let scrolls = 0;

    while (empresas.length < limite && scrolls < 20) {
      await this.page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollBy(0, 900);
      });
      await this.page.waitForTimeout(1500 + Math.random() * 800);

      const cartoes = await this.page.$$('[role="article"]');

      for (const cartao of cartoes) {
        if (empresas.length >= limite) break;
        try {
          const nome = await cartao.$eval(
            '.fontHeadlineSmall, [aria-label]',
            el => el.textContent?.trim() || el.getAttribute('aria-label')
          ).catch(() => null);

          if (!nome || vistos.has(nome)) continue;
          vistos.add(nome);

          await cartao.click();
          await this.page.waitForTimeout(1800);

          const dados = await this.extrairDetalhes();
          if (dados) {
            dados.nome_empresa = nome;
            empresas.push(dados);
            logger.info(`  ✓ [${empresas.length}/${limite}] ${nome}`);
          }
        } catch { /* continua */ }
      }
      scrolls++;

      // Verificar fim da lista
      const fimTexto = await this.page.evaluate(() => {
        return document.body.innerText.includes('Você chegou ao fim') ||
               document.body.innerText.includes('No more results');
      });
      if (fimTexto) break;
    }

    logger.info(`📋 Coletadas ${empresas.length} empresas`);
    return empresas;
  }

  async extrairDetalhes() {
    return this.page.evaluate(() => {
      const get = sel => document.querySelector(sel)?.getAttribute('aria-label') || null;
      const getHref = sel => document.querySelector(sel)?.href || null;

      const telefoneRaw = get('button[data-item-id*="phone"]')?.replace('Telefone: ', '');
      const site = getHref('a[data-item-id*="authority"]');
      const endereco = get('button[data-item-id*="address"]')?.replace('Endereço: ', '');
      const ratingEl = document.querySelector('.F7nice span[aria-hidden="true"]');
      const avaliacoes = ratingEl ? parseFloat(ratingEl.textContent.replace(',', '.')) : null;

      const normalizar = tel => {
        if (!tel) return null;
        const n = tel.replace(/\D/g, '');
        if (n.length < 10) return null;
        return n.startsWith('55') ? n : `55${n}`;
      };

      return {
        telefone: telefoneRaw || null,
        whatsapp: normalizar(telefoneRaw),
        site,
        endereco,
        avaliacoes
      };
    });
  }

  async fechar() {
    if (this.browser) await this.browser.close();
    this.browser = null;
  }
}
