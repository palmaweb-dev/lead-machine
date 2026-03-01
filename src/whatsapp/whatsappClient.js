import axios from 'axios';
import { logger } from '../utils/logger.js';

export class WhatsAppClient {

  constructor() {

    this.client = axios.create({
      baseURL: process.env.EVOLUTION_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY
      },
      timeout: 15000
    });

    this.instance = process.env.EVOLUTION_INSTANCE;

  }

  // =============================
  // Enviar mensagem
  // =============================
  async enviarMensagem(numero, texto) {

    try {

      await this.simularDigitacao(numero, texto.length);

      const res = await this.client.post(
        `/message/sendText/${this.instance}`,
        {
          number: numero,
          text: texto,
          delay: 1000
        }
      );

      logger.info(`✅ Mensagem enviada → ${numero}`);

      return {
        sucesso: true,
        id: res.data?.key?.id
      };

    } catch (erro) {

      logger.error(`❌ Falha ao enviar → ${numero}: ${erro.message}`);

      return {
        sucesso: false,
        erro: erro.message
      };

    }

  }


  // =============================
  // Simular digitando
  // =============================
  async simularDigitacao(numero, tamanho) {

    const ms = Math.min(
      Math.max(tamanho * 60, 2000),
      9000
    );

    try {

      await this.client.post(
        `/chat/sendPresence/${this.instance}`,
        {
          number: numero,
          options: {
            presence: 'composing',
            delay: ms
          }
        }
      );

    } catch {
      // ignora erro
    }

    await new Promise(r => setTimeout(r, ms));

  }


  // =============================
  // Verificar se número existe
  // =============================
  async verificarNumero(numero) {

    try {

      const res = await this.client.post(
        `/chat/whatsappNumbers/${this.instance}`,
        {
          numbers: [numero]
        }
      );

      return res.data?.[0]?.exists === true;

    } catch {

      return true; // se erro, tenta enviar mesmo

    }

  }


  // =============================
  // Parser Webhook Evolution V2
  // =============================
  parsearWebhook(body) {

    try {

      logger.info('📩 Webhook recebido');
      logger.info(JSON.stringify(body, null, 2));

      const data = body?.data || body;

      if (!data) return null;

      const key = data?.key || data?.message?.key || {};

      // Ignorar mensagens enviadas por você
      if (key?.fromMe) return null;

      const remoteJid = key?.remoteJid || data?.remoteJid || data?.jid;

      // ignora grupos/status
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') {
        return null;
      }

      const numero = remoteJid
        ?.replace('@s.whatsapp.net', '')
        ?.replace('@lid', '');

      let texto = '';

      const mensagem = data?.message || {};

      if (mensagem?.conversation) {
        texto = mensagem.conversation;
      } else if (mensagem?.extendedTextMessage?.text) {
        texto = mensagem.extendedTextMessage.text;
      } else if (mensagem?.imageMessage?.caption) {
        texto = mensagem.imageMessage.caption;
      } else if (mensagem?.videoMessage?.caption) {
        texto = mensagem.videoMessage.caption;
      } else if (mensagem?.buttonsResponseMessage?.selectedDisplayText) {
        texto = mensagem.buttonsResponseMessage.selectedDisplayText;
      } else if (mensagem?.listResponseMessage?.title) {
        texto = mensagem.listResponseMessage.title;
      }

      const textoNormalizado = texto?.trim();

      if (!numero || !textoNormalizado) {
        logger.warn('⚠️ Webhook sem texto válido');
        return null;
      }

      logger.info(`👤 Número: ${numero}`);
      logger.info(`💬 Texto: ${textoNormalizado}`);

      return {

        numero,
        texto: textoNormalizado,

        timestamp: new Date(
          (data.messageTimestamp || Date.now() / 1000) * 1000
        )

      };

    } catch (erro) {

      logger.error('❌ Erro parsearWebhook:', erro);
      return null;

    }

  }

}
