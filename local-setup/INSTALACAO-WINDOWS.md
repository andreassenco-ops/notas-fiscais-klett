# 🖥️ Instalação Local - Klett WhatsApp Sender (Windows)

## Visão Geral

Esta instalação substitui o Railway, rodando o **Worker** (Baileys/WhatsApp) e o **Bot** (Playwright) diretamente na sua máquina Windows. O banco de dados PostgreSQL e o frontend continuam no Lovable Cloud.

```
┌─────────────────────────────┐
│   Frontend (Lovable Cloud)  │
│   + PostgreSQL (Lovable)    │
│   + Edge Functions          │
└──────────┬──────────────────┘
           │ WORKER_API_URL (tunnel/IP fixo)
           ▼
┌─────────────────────────────┐
│   Sua Máquina Windows       │
│   ├── Worker (Baileys)      │  ← Porta 3000
│   ├── Bot (Playwright)      │  ← Envia mensagens
│   └── SQL Server (Autolac)  │  ← Acesso remoto (nuvem Autolac)
└─────────────────────────────┘
```

---

## ✅ Pré-requisitos

1. **Node.js 20+** → https://nodejs.org/
2. **Git** → https://git-scm.com/download/win
3. **Google Chrome** instalado (para o Bot Playwright)
4. **Acesso remoto ao SQL Server Autolac** (credenciais de consulta fornecidas pelo Autolac)

Verifique:
```cmd
node --version
git --version
```

---

## 📦 Passo 1: Clonar/Copiar o Projeto

```cmd
cd C:\Projetos
git clone <seu-repositorio> klett-whatsapp
cd klett-whatsapp
```

---

## 📦 Passo 2: Instalar o Worker (Baileys Engine)

```cmd
cd worker
npm install
npm run build
```

---

## 📦 Passo 3: Instalar o Bot (Playwright)

```cmd
cd worker
npm install dotenv playwright
npx playwright install chromium
```

---

## ⚙️ Passo 4: Configurar Variáveis de Ambiente

Crie o arquivo `worker/.env`:

```env
# ============================================
# CONFIGURAÇÃO LOCAL - Klett WhatsApp Sender
# ============================================

# Lovable Cloud (Supabase) - OBRIGATÓRIO
# Copie da aba Cloud do Lovable ou peça ao desenvolvedor
SUPABASE_URL=https://ftvzuqwvqaasfvaitlqz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<PEDIR_AO_DESENVOLVEDOR>

# Também aceita estas variantes (qualquer uma funciona):
# SUPABASE_ANON_KEY=eyJ...
# SUPABASE_PUBLISHABLE_KEY=eyJ...

# SQL Server - Autolac (REMOTO - nuvem do Autolac)
SQLSERVER_HOST=<IP_OU_HOST_FORNECIDO_PELO_AUTOLAC>
SQLSERVER_PORT=1433
SQLSERVER_DB=Autolac
SQLSERVER_USER=<USUARIO_DE_CONSULTA>
SQLSERVER_PASS=<SENHA_DE_CONSULTA>

# Timezone
TZ=America/Sao_Paulo

# Porta do servidor API (Worker)
PORT=3000

# Chrome (para o Bot Playwright) - ajuste se necessário
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### 🔑 Como obter a SUPABASE_SERVICE_ROLE_KEY

Esta chave é necessária para o worker gravar dados no banco. Peça ao desenvolvedor ou use a Edge Function temporária para recuperá-la.

---

## 🚀 Passo 5: Executar o Worker

### Opção A: Modo Desenvolvimento (com auto-reload)
```cmd
cd worker
npm run dev
```

### Opção B: Modo Produção
```cmd
cd worker
npm run build
npm start
```

Você deve ver:
```
✅ Configuração validada com sucesso
🔐 Backend key detectada: sb_* (len=...)
✅ Conectado ao SQL Server
🌐 API Server rodando na porta 3000
```

---

## 🤖 Passo 6: Executar o Bot (Playwright)

Em **outro terminal**:
```cmd
cd worker
node bot.js
```

Na primeira execução, o Chrome abrirá com WhatsApp Web. Escaneie o QR code. A sessão ficará salva em `worker/whatsapp-session/`.

---

## 🌐 Passo 7: Expor o Worker para a Internet

O Lovable Cloud precisa acessar seu Worker local. Escolha uma opção:

### Opção A: Cloudflare Tunnel (RECOMENDADO - Grátis)

1. Baixe: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Execute:
```cmd
cloudflared tunnel --url http://localhost:3000
```
3. Copie a URL gerada (ex: `https://xxx-xxx.trycloudflare.com`)

### Opção B: ngrok (Grátis com limitações)

1. Baixe: https://ngrok.com/download
2. Execute:
```cmd
ngrok http 3000
```
3. Copie a URL gerada (ex: `https://xxx.ngrok-free.app`)

### Opção C: IP Fixo + Port Forwarding

Se sua internet tem IP fixo:
1. Configure port forwarding no roteador (porta 3000 → IP da máquina)
2. Use `http://SEU_IP_PUBLICO:3000`

---

## 🔗 Passo 8: Atualizar WORKER_API_URL no Lovable

1. Vá ao painel Lovable
2. Abra **Settings → Cloud → Secrets**
3. Atualize o secret `WORKER_API_URL` com a URL do passo 7

Exemplo: `https://xxx-xxx.trycloudflare.com`

---

## ✅ Passo 9: Testar

### Teste 1: Health Check
Abra no navegador: `http://localhost:3000/health`

Deve retornar:
```json
{
  "status": "ok",
  "sqlServerConfigured": true,
  "whatsapp": { "dbStatus": "CONNECTED" }
}
```

### Teste 2: Testar via Dashboard
1. Acesse o dashboard Lovable
2. Vá em **Modelos** → clique em um modelo → **Testar Query**
3. Se retornar resultados, tudo está funcionando!

---

## 🔄 Executar como Serviço (Iniciar com o Windows)

### Usando PM2 (Recomendado)

```cmd
npm install -g pm2
pm2 install pm2-windows-startup

cd worker
pm2 start npm --name "klett-worker" -- start
pm2 start bot.js --name "klett-bot"
pm2 save
```

### Usando NSSM (Alternativa)

1. Baixe NSSM: https://nssm.cc/download
2. Execute:
```cmd
nssm install KlettWorker "C:\Program Files\nodejs\node.exe" "C:\Projetos\klett-whatsapp\worker\dist\index.js"
nssm set KlettWorker AppDirectory "C:\Projetos\klett-whatsapp\worker"
nssm set KlettWorker AppEnvironmentExtra "SUPABASE_URL=..." "SQLSERVER_HOST=..." 

nssm install KlettBot "C:\Program Files\nodejs\node.exe" "C:\Projetos\klett-whatsapp\worker\bot.js"
nssm set KlettBot AppDirectory "C:\Projetos\klett-whatsapp\worker"
```

---

## 🔧 Solução de Problemas

| Problema | Solução |
|----------|---------|
| `SQLSERVER_HOST not configured` | Verifique o arquivo `.env` |
| `Connection timeout` SQL Server | Verifique firewall/porta 1433 |
| Worker não recebe requests | Verifique tunnel (cloudflared/ngrok) |
| Bot não abre Chrome | Ajuste `CHROME_PATH` no `.env` |
| `Target closed` no Bot | Chrome crashou - reinicie o bot |
| QR Code não aparece | Worker Baileys precisa iniciar primeiro |

---

## 📊 Economia

| Serviço | Antes (Cloud) | Depois (Local) |
|---------|---------------|----------------|
| Railway (Worker) | ~$5-20/mês | R$0 |
| SQL Server proxy | Via Railway | Direto (local) |
| Frontend + DB | Lovable Cloud | Lovable Cloud (mantém) |
| Tunnel | - | Grátis (Cloudflare) |

---

## 📝 Notas Importantes

1. **Mantenha o computador ligado** - o Worker e Bot precisam rodar 24/7
2. **Cloudflare Tunnel** gera URLs novas a cada reinício (a menos que configure um tunnel nomeado com conta grátis)
3. **Backup da sessão WhatsApp** - a pasta `whatsapp-session/` contém a sessão do Chrome. Faça backup periodicamente
4. O **cron job** (sync a cada 5 min) continua rodando no Lovable Cloud e chama seu Worker local via tunnel
