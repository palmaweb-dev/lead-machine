#!/bin/bash
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${CYAN}\n⚙️  Instalando Painel de Configurações...\n${NC}"
cd /opt/lead-machine

# 1. Copiar settings.html para o dashboard
cp settings.html src/dashboard/public/settings.html
echo -e "${GREEN}✓ settings.html instalado${NC}"

# 2. Adicionar rotas no server.js (antes da linha do webhook)
if grep -q "api/configuracoes" src/dashboard/server.js; then
  echo -e "${YELLOW}⚠ Rotas já existem — pulando${NC}"
else
  sed -i '/\/\/ Webhook WhatsApp/i\
// Configurações\
app.get("/api/configuracoes", auth, async (req, res) => {\
  const { data } = await sb.from("configuracoes").select("id, valor");\
  const configs = {};\
  (data || []).forEach(row => { configs[row.id] = row.valor; });\
  res.json(configs);\
});\
\
app.post("/api/configuracoes", auth, async (req, res) => {\
  const { id, valor } = req.body;\
  if (!id || valor === undefined) return res.status(400).json({ erro: "id e valor obrigatorios" });\
  const { error } = await sb.from("configuracoes").upsert({ id, valor, updated_at: new Date() }, { onConflict: "id" });\
  if (error) return res.status(500).json({ erro: error.message });\
  res.json({ ok: true });\
});\
\
app.get("/configuracoes", (req, res) => {\
  res.sendFile(join(__dirname, "public", "settings.html"));\
});\
' src/dashboard/server.js
  echo -e "${GREEN}✓ Rotas adicionadas ao server.js${NC}"
fi

# 3. Reiniciar
pm2 restart lead-machine --update-env
sleep 3
pm2 status

IP=$(curl -s ifconfig.me 2>/dev/null)
echo -e "\n${GREEN}╔══════════════════════════════════════════════════╗"
echo -e "║  ✅  Painel de Configurações instalado!          ║"
echo -e "║                                                  ║"
echo -e "║  Acesse: http://${IP}:3000/configuracoes   ║"
echo -e "╚══════════════════════════════════════════════════╝${NC}\n"
