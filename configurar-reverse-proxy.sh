#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

DOMAIN="${1:-app.palmaweb.com.br}"
SERVER_IP="${2:-82.25.77.50}"
EMAIL="${3:-}"
APP_PORT="${4:-3000}"

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Este script precisa ser executado como root (sudo).${NC}"
  exit 1
fi

if [[ -z "$EMAIL" ]]; then
  echo -e "${RED}Uso: sudo ./configurar-reverse-proxy.sh <subdominio> <ip-servidor> <email-certbot> [porta-app]${NC}"
  echo -e "${YELLOW}Exemplo:${NC} sudo ./configurar-reverse-proxy.sh app.palmaweb.com.br 82.25.77.50 admin@palmaweb.com.br 3000"
  exit 1
fi

echo -e "${CYAN}\n╔══════════════════════════════════════════════════════╗"
echo -e "║  Lead Machine — Nginx Reverse Proxy + SSL (auto)    ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}\n"

echo -e "${YELLOW}→ Verificando dependências...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx curl

if ! systemctl is-enabled nginx >/dev/null 2>&1; then
  systemctl enable nginx
fi
systemctl start nginx

CURRENT_DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}')"
if [[ -z "$CURRENT_DNS_IP" ]]; then
  echo -e "${RED}✗ Não foi possível resolver DNS de ${DOMAIN}.${NC}"
  echo -e "${YELLOW}Crie um registro A apontando para ${SERVER_IP} e execute novamente.${NC}"
  exit 1
fi

if [[ "$CURRENT_DNS_IP" != "$SERVER_IP" ]]; then
  echo -e "${RED}✗ DNS incorreto para ${DOMAIN}.${NC}"
  echo -e "Esperado: ${SERVER_IP} | Encontrado: ${CURRENT_DNS_IP}"
  echo -e "${YELLOW}Ajuste o registro A e execute novamente.${NC}"
  exit 1
fi

NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
cat > "$NGINX_SITE" <<EONGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass \$http_upgrade;
    }
}
EONGINX

ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo -e "${YELLOW}→ Emitindo certificado SSL com Let's Encrypt...${NC}"
certbot --nginx --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAIN" --redirect

nginx -t
systemctl reload nginx

echo -e "\n${GREEN}✅ Configuração concluída com sucesso!${NC}"
echo -e "${GREEN}URL:${NC} https://${DOMAIN}"
echo -e "${GREEN}Origem interna:${NC} http://127.0.0.1:${APP_PORT}"
