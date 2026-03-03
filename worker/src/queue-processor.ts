/**
 * Motor de processamento da fila de envios
 * v4: O bot.js cuida dos envios via Playwright.
 * Este processador apenas monitora a fila e gera logs.
 */

import { format, isWithinInterval, set } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import {
  getSettings,
  getNextPendingItem,
  markAsSent,
  markAsError,
  logEvent,
  Settings,
} from './supabase';
import { config } from './config';
import { getModelMessageForSending, replaceVariables } from './model-executor';
import { sendMessage } from './whatsapp';
import { getPgPool } from './pg-routes';

let isProcessing = false;
let lastProcessedAt: Date | null = null;

/**
 * Verifica se estamos dentro da janela de envio
 */
function isWithinSendWindow(settings: Settings): boolean {
  const timezone = config.timezone;
  const now = toZonedTime(new Date(), timezone);

  // Parse dos horários
  const [startHour, startMinute] = settings.send_window_start.split(':').map(Number);
  const [endHour, endMinute] = settings.send_window_end.split(':').map(Number);

  const startTime = set(now, { hours: startHour, minutes: startMinute, seconds: 0 });
  const endTime = set(now, { hours: endHour, minutes: endMinute, seconds: 59 });

  const withinWindow = isWithinInterval(now, { start: startTime, end: endTime });

  if (!withinWindow) {
    const currentTime = format(now, 'HH:mm');
    console.log(
      `⏰ Fora da janela de envio. Atual: ${currentTime}, Janela: ${settings.send_window_start}-${settings.send_window_end}`
    );
  }

  return withinWindow;
}

/**
 * Gera delay aleatório entre min e max segundos
 */
function getRandomDelay(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(10, minSeconds);
  const max = Math.max(min + 10, maxSeconds);
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

/**
 * Busca delay do modelo específico
 */
async function getModelDelay(modelId: number): Promise<{ min: number; max: number } | null> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT delay_min_seconds, delay_max_seconds FROM models WHERE id = $1`,
    [modelId]
  );

  if (!rows[0]) return null;
  return { min: rows[0].delay_min_seconds, max: rows[0].delay_max_seconds };
}

/**
 * Processa o próximo item da fila
 */
async function processNextItem(): Promise<boolean> {
  // O bot.js cuida dos envios — este processador apenas monitora
  // Não processar itens aqui, o bot.js faz isso diretamente no PostgreSQL
  return false;
}

/**
 * Processa um item específico
 */
async function processItem(
  item: Awaited<ReturnType<typeof getNextPendingItem>>,
  settings: Settings,
  isTest: boolean
): Promise<boolean> {
  if (!item) return false;

  try {
    let delayMin = settings.delay_min_seconds;
    let delayMax = settings.delay_max_seconds;

    // OBRIGATÓRIO: Toda mensagem DEVE ter um model_id para usar o template correto
    if (!item.model_id) {
      const errorMsg = 'Mensagem sem model_id não é permitida. Defina um modelo antes de enviar.';
      await markAsError(item.id, errorMsg);
      await logEvent('SEND_ERROR', item.id, { error: errorMsg, protocol: item.protocol });
      console.error(`❌ ${errorMsg} (${item.protocol})`);
      return true;
    }

    // Buscar template do modelo
    const modelMessage = await getModelMessageForSending(item.model_id);
    
    if (!modelMessage) {
      await markAsError(item.id, 'Nenhuma mensagem ativa encontrada para o modelo');
      await logEvent('SEND_ERROR', item.id, { error: 'No active message for model', model_id: item.model_id });
      return true;
    }

    // Substituir variáveis na mensagem
    const variables = (item as any).variables || {};
    const message = replaceVariables(modelMessage, variables);

    // VALIDAÇÃO RIGOROSA: mensagem deve ter no mínimo 10 caracteres
    const trimmedMessage = message.trim();
    const MIN_MESSAGE_LENGTH = 10;
    
    if (!trimmedMessage || trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      const errorType = !trimmedMessage ? 'EMPTY_MESSAGE' : 'MESSAGE_TOO_SHORT';
      console.error(`❌ ERRO CRÍTICO: ${errorType}!`);
      console.error(`  Template: ${modelMessage?.substring(0, 100)}...`);
      console.error(`  Variáveis: ${JSON.stringify(variables)}`);
      console.error(`  Resultado (${trimmedMessage?.length || 0} chars): "${trimmedMessage?.substring(0, 50)}"`);
      await markAsError(item.id, `ERROR_EMPTY_TEMPLATE: Mensagem ${!trimmedMessage ? 'vazia' : `muito curta (${trimmedMessage.length} chars)`}`);
      await logEvent('SEND_ERROR', item.id, { 
        error: errorType, 
        template: modelMessage?.substring(0, 200), 
        variables,
        resultLength: trimmedMessage?.length || 0,
      });
      return true;
    }

    // Log dos primeiros 50 chars para conferência no Railway
    console.log(`📝 [AUDIT] Mensagem processada (${trimmedMessage.length} chars): "${trimmedMessage.substring(0, 50)}..."`);
    console.log(`📝 Modelo ${item.model_id}: Template OK, ${Object.keys(variables).length} variáveis aplicadas`);

    // Buscar delay específico do modelo
    const modelDelay = await getModelDelay(item.model_id);
    if (modelDelay) {
      delayMin = modelDelay.min;
      delayMax = modelDelay.max;
    }

    console.log(`📝 ${isTest ? '[TESTE] ' : ''}Modelo ${item.model_id}: Usando template com ${Object.keys(variables).length} variáveis`);

    // Enviar mensagem (usa trimmedMessage validada)
     const result = await sendMessage(item.phone, trimmedMessage);

    if (result.success) {
      await markAsSent(item.id);
      // Gravar messageId retornado para prova objetiva de envio
      await logEvent(isTest ? 'TEST_SENT' : 'SENT', item.id, {
        phone: item.phone,
        is_test: isTest,
        model_id: item.model_id || null,
        message_id: result.messageId || null,
        jid: (result as any).jid || null,
        verified_number: (result as any).verifiedNumber || null,
        verification_attempts: (result as any).verificationAttempts || null,
        jid_differs_from_original: (result as any).jidDiffersFromOriginal || false,
        timestamp: new Date().toISOString(),
      });
      console.log(`✅ ${isTest ? '[TESTE] ' : ''}Enviado: ${isTest ? item.protocol : '#' + item.sequence_num} (msg_id: ${result.messageId || 'N/A'}, jid_diff: ${(result as any).jidDiffersFromOriginal || false})`);
    } else {
      await markAsError(item.id, result.error || 'Erro desconhecido');
      await logEvent('SEND_ERROR', item.id, {
        error: result.error,
        phone: item.phone,
        is_test: isTest,
        model_id: item.model_id || null,
         jid: (result as any).jid || null,
         verified_number: (result as any).verifiedNumber || null,
         verification_attempts: (result as any).verificationAttempts || null,
        timestamp: new Date().toISOString(),
      });
      console.log(`❌ Erro ao enviar ${isTest ? item.protocol : '#' + item.sequence_num}: ${result.error}`);
    }

    lastProcessedAt = new Date();

    // SEMPRE aplicar delay entre mensagens (40-110s) - SEM EXCEÇÕES
    // Isso evita detecção de spam pelo WhatsApp
    const delay = getRandomDelay(delayMin, delayMax);
    
    console.log(`⏳ Delay obrigatório: aguardando ${delay / 1000}s antes do próximo envio...`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erro ao processar ${item.protocol}:`, error);
    
    try {
      await markAsError(item.id, errorMessage);
      await logEvent('SEND_ERROR', item.id, { error: errorMessage });
    } catch (logError) {
      console.error('Erro ao registrar falha:', logError);
    }

    return true;
  }
}

// Funções movidas para processItem

/**
 * Loop principal do processador de fila
 */
export async function startQueueProcessor(): Promise<void> {
  if (isProcessing) {
    console.log('⚠️ Processador já está rodando');
    return;
  }

  isProcessing = true;
  console.log('🚀 Iniciando processador de fila...');

  while (isProcessing) {
    try {
      const processed = await processNextItem();

      if (!processed) {
        // Se não processou nada, aguardar antes de verificar novamente
        await new Promise((resolve) =>
          setTimeout(resolve, config.intervals.queueProcessor)
        );
      }
    } catch (error) {
      console.error('❌ Erro no processador de fila:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Para o processador de fila
 */
export function stopQueueProcessor(): void {
  isProcessing = false;
  console.log('🛑 Processador de fila parado');
}

/**
 * Retorna status do processador
 */
export function getProcessorStatus(): {
  isRunning: boolean;
  lastProcessedAt: Date | null;
} {
  return {
    isRunning: isProcessing,
    lastProcessedAt,
  };
}
