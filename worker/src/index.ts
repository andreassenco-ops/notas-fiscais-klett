/**
 * Klett Whats Sender - Worker Principal
 * v4.1: API + Sync + test-query route
 * O bot.js cuida dos envios via Playwright + WhatsApp Web
 *
 * Este worker é responsável por:
 * 1. Executar queries dos modelos periodicamente (sync Autolac → PostgreSQL)
 * 2. Expor API HTTP para o dashboard
 */

import dotenv from 'dotenv';
dotenv.config();

import { validateConfig } from './config';
import { startQueueProcessor, stopQueueProcessor } from './queue-processor';
import { startScheduler, stopScheduler } from './scheduler';
import { closeConnection } from './sqlserver';
import { startApiServer, closeApiPool } from './api-server';
import { getPgPool } from './pg-routes';

async function logEventLocal(event: string, queueId?: string, details?: Record<string, unknown>): Promise<void> {
  try {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO send_logs (event, queue_id, details) VALUES ($1, $2, $3)`,
      [event, queueId || null, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Erro ao registrar log local:', err);
  }
}

let isShuttingDown = false;

console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🔬 Klett Whats Sender - Worker v4.0             ║
║   API + Sincronização (sem Baileys)               ║
║   Build: ${new Date().toISOString().slice(0, 10)}                            ║
║   📡 Bot.js cuida dos envios via Playwright       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);

async function main(): Promise<void> {
  try {
    validateConfig();

    console.log('🚀 Iniciando worker...');
    await logEventLocal('WORKER_STARTED', undefined, {
      engine: 'local-api',
      version: '4.0.0',
    });

    // Iniciar agendador (sync Autolac → PostgreSQL)
    await startScheduler();

    // Iniciar monitor de fila (apenas logs)
    startQueueProcessor();

    // Iniciar servidor API (porta 3000)
    startApiServer();

    console.log(`
╔═══════════════════════════════════════════════════╗
║  ✅ Worker v4.0 rodando com sucesso!              ║
║                                                   ║
║  • API: Porta 3000                                ║
║  • Sync: Agendada (Autolac → PostgreSQL)          ║
║  • WhatsApp: Via bot.js (Playwright)              ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);
  } catch (error) {
    console.error('❌ Erro fatal ao iniciar worker:', error);
    await logEventLocal('WORKER_ERROR', undefined, {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Tratamento de sinais de término
async function shutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Recebido sinal ${signal}, encerrando...`);
  isShuttingDown = true;

  try {
    await logEventLocal('WORKER_STOPPED', undefined, { signal });
    stopQueueProcessor();
    stopScheduler();
    await closeConnection();
    await closeApiPool();
    console.log('👋 Worker encerrado com sucesso');
  } catch (error) {
    console.error('Erro ao encerrar:', error);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', async (error) => {
  console.error('❌ Exceção não capturada:', error.message);
  try {
    await logEventLocal('UNCAUGHT_EXCEPTION', undefined, {
      error: error.message,
      stack: error.stack?.substring(0, 500),
    });
  } catch {}
});

process.on('unhandledRejection', async (reason) => {
  const reasonStr = String(reason);
  console.error('❌ Promise rejeitada:', reasonStr.substring(0, 200));
  try {
    await logEventLocal('UNHANDLED_REJECTION', undefined, {
      reason: reasonStr.substring(0, 500),
    });
  } catch {}
});

main();
