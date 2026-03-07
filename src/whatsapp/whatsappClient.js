// =============================================================
// INTEGRAO UAZAPI (substituio completa da Evolution API)
// Migrao realizada em: 2026-06-03
// Documentao: https://docs.uazapi.com
// Server URL: https://palmaweb.uazapi.com
// Autenticao: header 'token' com UAZAPI_TOKEN
// =============================================================

import axios from 'axios';
import { logger } from '../utils/logger.js';

export class WhatsAppClient {

  constructor() {
    // [UAZAPI] Configurao do cliente HTTP para a API Uaizap
    // Substitui: EVOLUTION_API_URL, EVOLUTION_API_KEY (apikey header)
    // Agora usa: UAZAPI_SERVER_URL, UAZAPI_TOKEN (token header)
    this.client = axios.create({
      baseURL: process.env.UAZAPI_SERVER_URL,
      headers: {
        'Content-Type': 'application/json',
        'token': process.env.UAZAPI_TOKEN
      },
      timeout: 15000
    });
  }

  // ==============================
  // Enviar mensagem
  // [UAZAPI] Endpoint: POST /send/text
  // Antes (Evolution): POST /message/sendText/{instance}
  // ==============================
  async enviarMensagem(numero, texto) {

    try {

      // [UAZAPI] Simula digitao via delay nativo do endpoint /send/text
      // A Uaizap suporta o campo 'delay' diretamente no payload
      // que exibe "Digitando..." antes do envio
      await this.simularDigitacao(numero, texto.length);

      // [UAZAPI] Envia mensagem de texto
      // Endpoint: POST /send/text
      // Payload: { number, text, delay, linkPreview }
      const res = await this.client.post('/send/text', {
        number: numero,
        text: texto,
        delay: 1000,
        linkPreview: false
      });

      logger.info(`Mensagem enviada  ${numero}`);

      return {
        sucesso: true,
        id: res.data?.id
      };

    } catch (erro) {

      logger.error(`Falha ao enviar  ${numero}: ${erro.message}`);

      return {
        sucesso: false,
        erro: erro.message
      };

    }

  }

  // ==============================
  // Simular digitando
  // [UAZAPI] Endpoint: POST /send/presence
  // Antes (Evolution): POST /chat/sendPresence/{instance}
  // ==============================
  async simularDigitacao(numero, tamanho) {

    const ms = Math.min(
      Math.max(tamanho * 60, 2000),
      9000
    );

    try {

      // [UAZAPI] Envia status de presena "composing" (digitando)
      // Endpoint: POST /send/presence
      await this.client.post('/send/presence', {
        number: numero,
        presence: 'composing',
        delay: ms
      });

    } catch {
      // ignora erro de presena silenciosamente
    }

    await new Promise(r => setTimeout(r, ms));

  }

  // ==============================
  // Verificar se nmero existe no WhatsApp
  // [UAZAPI] Endpoint: POST /contact/check
  // Antes (Evolution): POST /chat/whatsappNumbers/{instance}
  // ==============================
  async verificarNumero(numero) {

    try {

      // [UAZAPI] Verifica se o nmero est registrado no WhatsApp
      // Endpoint: POST /contact/check
      const res = await this.client.post('/contact/check', {
        number: numero
      });

      return res.data?.exists === true;

    } catch {

      return true; // se erro, tenta enviar mesmo assim

    }

  }

  // ==============================
  // Verificar status da conexo da instncia
  // [UAZAPI] Endpoint: GET /instance/status
  // Antes (Evolution): GET /instance/connectionState/{instance}
  // ==============================
  async verificarStatus() {

    try {

      // [UAZAPI] Retorna estado atual da instncia
      // Estados possveis: disconnected | connecting | connected
      const res = await this.client.get('/instance/status');

      return {
        conectado: res.data?.state === 'connected',
        estado: res.data?.state || 'unknown'
      };

    } catch (erro) {

      logger.error(`Erro ao verificar status: ${erro.message}`);

      return {
        conectado: false,
        estado: 'error'
      };

    }

  }

  // ==============================
  // Conectar instncia ao WhatsApp
  // [UAZAPI] Endpoint: POST /instance/connect
  // Antes (Evolution): GET /instance/connect/{instance}
  // ==============================
  async conectar() {

    try {

      // [UAZAPI] Inicia conexo. Retorna QR code ou cdigo de pareamento.
      // Endpoint: POST /instance/connect
      const res = await this.client.post('/instance/connect', {});

      logger.info(' Solicitao de conexo enviada  Uaizap');

      return res.data;

    } catch (erro) {

      logger.error(`Erro ao conectar instncia: ${erro.message}`);

      return null;

    }

  }

  // ==============================
  // Configurar Webhook na Uaizap
  // [UAZAPI] Endpoint: POST /webhook
  // Configura automaticamente o webhook para receber eventos
  // ==============================
  async configurarWebhook(urlWebhook) {

    try {

      // [UAZAPI] Configura webhook no modo simples (recomendado)
      // Recebe eventos: messages e connection
      // excludeMessages: evita loop de mensagens enviadas pela prpria API
      const res = await this.client.post('/webhook', {
        enabled: true,
        url: urlWebhook,
        events: ['messages', 'connection'],
        excludeMessages: ['wasSentByApi']
      });

      logger.info(` Webhook configurado: ${urlWebhook}`);

      return res.data;

    } catch (erro) {

      logger.error(`Erro ao configurar webhook: ${erro.message}`);

      return null;

    }

  }

  // ==============================
  // Parser Webhook Uaizap
  // [UAZAPI] Formato do payload recebido:
  // {
  //   event: "messages",
  //   instance: "id-da-instancia",
  //   data: {
  //     id, messageid, chatid, sender, senderName,
  //     isGroup, fromMe, messageType, text,
  //     messageTimestamp, ...
  //   }
  // }
  // Antes (Evolution): event === 'messages.upsert', body.data.key.remoteJid, etc.
  // ==============================
  parsearWebhook(body) {

    try {

      logger.info('\u{1F4E8}Webhook recebido');
      logger.info(JSON.stringify(body, null, 2));

      // [UAZAPI] Suporte a dois formatos de payload:
      // Formato A: body.EventType + body.message + body.chat (enriched)
      // Formato B: body.event + body.data (simples)
      const eventType = body?.EventType || body?.event;
      if (eventType && eventType !== 'messages') return null;

      // Pega o objeto da mensagem em qualquer formato
      const data = body?.message || body?.data;
      if (!data) return null;

      // Ignora mensagens enviadas pela propria conta
      if (data?.fromMe) return null;

      // Ignora grupos
      if (data?.isGroup) return null;

      // [FIX LID] No WhatsApp Business o sender vem como LID (@lid)
      // sender_pn contem o numero real E164 correto
      const senderRaw = data?.sender_pn || data?.sender;
      const numero = senderRaw
        ?.replace('@s.whatsapp.net', '')
        ?.replace('@c.us', '')
        ?.replace('@lid', '');

      // Texto da mensagem - suporta campos text e content
      let texto = data?.text || data?.content || '';

      // Respostas de botoes e listas
      if (!texto && data?.buttonOrListid) {
        texto = data?.buttonOrListid;
      }

      if (!numero || !texto) {
        logger.warn('\u26A0\uFE0FWebhook sem texto valido');
        return null;
      }

      logger.info(`\u{1F464}Numero: ${numero}`);
      logger.info(`\u{1F4AC}Texto: ${texto}`);

      return {
        numero,
        texto,
        timestamp: new Date(
          (data.messageTimestamp || Date.now() / 1000) * 1000
        )
      };

    } catch (erro) {
      logger.error('\u274CErro parsearWebhook:', erro);
      return null;
    }

  }

}
