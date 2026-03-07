#!/bin/bash

DOMINIO=$1
IP=$2
EMAIL=$3
PORTA=$4

if [ -z "$DOMINIO" ] || [ -z "$EMAIL" ] || [ -z "$PORTA" ]; then
  echo "Uso: $0 dominio ip email porta"
  exit 1
fi

echo "🚀 Instalando Nginx..."
apt update
apt install nginx certbot python3-certbot-nginx -y

echo "🧹 Limpando configuração antiga..."
rm -f /etc/nginx/sites-enabled/default

CONFIG="/etc/nginx/sites-available/$DOMINIO"

echo "⚙️ Criando configuração do Nginx..."

cat > $CONFIG <<EOF
server {
    listen 80;
    server_name $DOMINIO;

    location / {
        proxy_pass http://localhost:$PORTA;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -s $CONFIG /etc/nginx/sites-enabled/

echo "🔄 Reiniciando Nginx..."
systemctl restart nginx

echo "🔐 Gerando SSL..."
certbot --nginx -d $DOMINIO --non-interactive --agree-tos -m $EMAIL

echo "✅ Concluído!"
echo "Acesse: https://$DOMINIO"
