#!/bin/bash
# Script interativo para preencher o .env

CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "\n${CYAN}╔══════════════════════════════════════╗"
echo -e "║  Lead Machine — Configuração Inicial  ║"
echo -e "╚══════════════════════════════════════╝${NC}\n"

ENV_FILE="/opt/lead-machine/.env"

read -p "🔹 URL do Supabase (https://xxx.supabase.co): " SUP_URL
read -p "🔹 Service Role Key do Supabase: " SUP_KEY
read -p "🔹 API Key da OpenAI (sk-...): " OAI_KEY
read -p "🔹 API Key da Evolution API [minha-chave-secreta]: " EVO_KEY
EVO_KEY=${EVO_KEY:-minha-chave-secreta}
read -p "🔹 Link do Calendly [https://calendly.com/sua-agencia]: " CAL_LINK
CAL_LINK=${CAL_LINK:-https://calendly.com/sua-agencia/diagnostico}
read -s -p "🔹 Senha do painel admin: " DASH_PASS
echo

# Escrever .env
cat > $ENV_FILE << EOF
SUPABASE_URL=$SUP_URL
SUPABASE_KEY=$SUP_KEY
OPENAI_API_KEY=$OAI_KEY
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=$EVO_KEY
EVOLUTION_INSTANCE=agencia
MENSAGENS_POR_DIA=40
DELAY_ENTRE_MENSAGENS=50000
HORARIO_INICIO=09:00
HORARIO_FIM=17:30
CALENDLY_LINK=$CAL_LINK
DASHBOARD_PORT=3000
DASHBOARD_SECRET=$DASH_PASS
EOF

echo -e "\n${GREEN}✓ .env configurado!${NC}"

read -p "🔹 Deseja configurar Nginx + SSL para um subdomínio agora? (s/N): " CFG_SSL

if [[ "$CFG_SSL" =~ ^[Ss]$ ]]; then
  read -p "🔹 Subdomínio [app.palmaweb.com.br]: " DOMAIN
  DOMAIN=${DOMAIN:-app.palmaweb.com.br}

  read -p "🔹 IP público do servidor [82.25.77.50]: " SERVER_IP
  SERVER_IP=${SERVER_IP:-82.25.77.50}

  read -p "🔹 E-mail para Let's Encrypt: " CERTBOT_EMAIL

  if [[ -z "$CERTBOT_EMAIL" ]]; then
    echo -e "${YELLOW}⚠ E-mail não informado. Pulando configuração de SSL.${NC}"
    exit 0
  fi

  if [[ -x /opt/lead-machine/configurar-reverse-proxy.sh ]]; then
    echo -e "${CYAN}\n→ Configurando Nginx reverse proxy com SSL...${NC}"
    sudo /opt/lead-machine/configurar-reverse-proxy.sh "$DOMAIN" "$SERVER_IP" "$CERTBOT_EMAIL" 3000
  else
    echo -e "${YELLOW}⚠ Script /opt/lead-machine/configurar-reverse-proxy.sh não encontrado.${NC}"
  fi
fi
