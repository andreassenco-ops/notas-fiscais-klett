# Klett Whats Sender - Worker v3.0

Worker Node.js para envio automatizado de resultados de exames via WhatsApp.

## 🚀 v3.0 - Baileys Engine

**MUDANÇA IMPORTANTE**: Esta versão migra de `whatsapp-web.js` + Puppeteer para `@whiskeysockets/baileys`, eliminando:

- ❌ Chromium/Puppeteer (800MB+ de dependências)
- ❌ Crashes de memória ("Target closed", "Protocol error")
- ❌ Conflitos de profile/SingletonLock
- ❌ Deslogamentos inexplicáveis

### ✅ Benefícios

- ⚡ **Build 5x mais rápido** (~30s vs 3-5min)
- 💾 **Memória 10x menor** (~50MB vs 500MB+)
- 🔒 **Conexão estável** (WebSocket direto, sem browser)
- 🔄 **Reconexão automática** com circuit breaker inteligente

## Arquitetura

```
┌─────────────────────┐     ┌──────────────────────┐
│   Frontend Lovable  │────▶│  Edge Function       │
│   (Dashboard)       │     │  (whatsapp-control)  │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                                       ▼
┌─────────────────────┐     ┌──────────────────────┐
│   SQL Server        │────▶│  Worker Railway      │
│   (Autolac)         │     │  (Baileys Engine)    │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │   WhatsApp Web       │
                            │   (WebSocket)        │
                            └──────────────────────┘
```

## Variáveis de Ambiente (Railway)

```env
# Supabase (obrigatório)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Para backup de sessão

# SQL Server Autolac (para importação)
SQLSERVER_HOST=xxx.dbserver.autolac.com.br
SQLSERVER_PORT=2789
SQLSERVER_DB=Autolac
SQLSERVER_USER=xxx
SQLSERVER_PASS=xxx

# Timezone
TZ=America/Sao_Paulo

# Volume (opcional, para persistência)
DATA_PATH=/data
```

## Deploy no Railway

1. Faça fork/push do código para um repositório Git
2. Crie um novo projeto no Railway
3. Conecte ao repositório
4. Configure as variáveis de ambiente
5. (Opcional) Adicione um Volume montado em `/data` para persistência de sessão

### Volume Persistente

Para manter a sessão entre deploys:

1. No Railway, vá em **Settings > Volumes**
2. Adicione um volume com mount path `/data`
3. Configure `DATA_PATH=/data` nas variáveis

## Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | Status do worker |
| POST | `/api/whatsapp/start` | Iniciar conexão WhatsApp |
| GET | `/api/whatsapp/status` | Status da conexão |
| POST | `/api/whatsapp/stop` | Desconectar |
| POST | `/api/whatsapp/send` | Enviar mensagem manual |
| POST | `/api/test-query` | Testar query SQL |

## Estrutura de Arquivos

```
worker/
├── src/
│   ├── index.ts          # Ponto de entrada
│   ├── whatsapp.ts       # Motor Baileys
│   ├── api-server.ts     # Servidor HTTP
│   ├── queue-processor.ts # Processador de fila
│   ├── scheduler.ts      # Agendador de tarefas
│   ├── model-executor.ts # Executor de queries SQL
│   ├── sqlserver.ts      # Conexão SQL Server
│   ├── supabase.ts       # Cliente Supabase
│   ├── session-backup.ts # Backup de sessão
│   └── config.ts         # Configurações
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Fluxo de Conexão

1. Usuário clica "Conectar" no dashboard
2. Edge Function chama `POST /api/whatsapp/start`
3. Worker inicializa Baileys e gera QR Code
4. QR é salvo no Supabase (base64)
5. Frontend exibe QR no modal
6. Usuário escaneia com celular
7. Baileys emite `connection.update` com `connection: 'open'`
8. Status atualizado para `CONNECTED`
9. Heartbeat e backup periódico iniciados

## Circuit Breaker

Se o WhatsApp deslogar (logout no celular), o worker:

1. Detecta `DisconnectReason.loggedOut`
2. Bloqueia reconexão automática
3. Limpa sessão local e backup
4. Atualiza status para `DISCONNECTED`

Usuário precisa clicar "Conectar" novamente para parear.

## Desenvolvimento Local

```bash
cd worker
npm install
npm run dev
```

## Logs de Diagnóstico

Todos os eventos são registrados na tabela `send_logs`:

- `WORKER_STARTED` - Worker iniciado
- `QR_GENERATED` - QR Code gerado
- `SESSION_CONNECTED` - Conexão estabelecida
- `SESSION_DISCONNECTED` - Desconectado
- `HARD_LOGOUT_DETECTED` - Logout detectado
- `SENT` / `SEND_ERROR` - Mensagens enviadas/erro
- `SESSION_BACKUP_SUCCESS` - Backup realizado

## Versões Estáveis (Rollback)

Se precisar reverter para Puppeteer (não recomendado):

```json
{
  "dependencies": {
    "whatsapp-web.js": "1.34.1",
    "puppeteer": "23.0.0"
  }
}
```

⚠️ **Aviso**: A versão Puppeteer tem problemas conhecidos de estabilidade.
