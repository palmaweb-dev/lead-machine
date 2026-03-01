#!/bin/bash
set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${CYAN}\n🚀 Iniciando Lead Machine...\n${NC}"

cd /opt/lead-machine

# 1. Subir Evolution API
echo -e "${YELLOW}→ Iniciando Evolution API (WhatsApp)...${NC}"
docker-compose up -d
sleep 5

# 2. Criar instância WhatsApp
echo -e "${YELLOW}→ Configurando instância WhatsApp...${NC}"
curl -s -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: $(grep EVOLUTION_API_KEY .env | cut -d= -f2)" \
  -d '{"instanceName":"agencia","qrcode":true}' > /dev/null 2>&1 || true

sleep 2

# 3. Iniciar aplicação com PM2
echo -e "${YELLOW}→ Iniciando aplicação...${NC}"
pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart lead-machine
pm2 save

echo -e "\n${GREEN}╔══════════════════════════════════════════════╗"
echo -e "║  ✅ Lead Machine iniciado com sucesso!        ║"
echo -e "╠══════════════════════════════════════════════╣"
echo -e "║  🖥️  Painel:    http://$(curl -s ifconfig.me 2>/dev/null):3000    ║"
echo -e "║  📱 QR Code:  http://$(curl -s ifconfig.me 2>/dev/null):8080     ║"
echo -e "║  📋 Logs:     pm2 logs lead-machine          ║"
echo -e "╚══════════════════════════════════════════════╝${NC}\n"

echo "Para conectar o WhatsApp, acesse:"
echo "http://$(curl -s ifconfig.me 2>/dev/null):8080/instance/connect/agencia"
