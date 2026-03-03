/**
 * Gerenciamento de sessão WhatsApp usando Baileys
 * v3.9: Estabilidade Avançada - Auto-reconexão silenciosa + Cooldown + Heartbeat 15s
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  ConnectionState,
  proto,
  WAMessageKey,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import pino from 'pino';
import {
  getWhatsAppSession,
  updateWhatsAppSession,
  logEvent,
  acquireWhatsAppLock,
  releaseWhatsAppLock,
  renewWhatsAppLock,
} from './supabase';
import { backupSession, restoreSession, deleteBackup } from './session-backup';

// Logger silencioso para Baileys (evita spam no console)
const logger = pino({ level: 'silent' });

// ============================================
// In-Memory Message Store (para getMessage)
// ============================================
const messageStore: Map<string, proto.IWebMessageInfo> = new Map();

function storeMessage(msg: proto.IWebMessageInfo): void {
  const key = `${msg.key.remoteJid}_${msg.key.id}`;
  messageStore.set(key, msg);
  if (messageStore.size > 1000) {
    const firstKey = messageStore.keys().next().value;
    if (firstKey) messageStore.delete(firstKey);
  }
}

function getMessage(key: WAMessageKey): proto.IMessage | undefined {
  const storeKey = `${key.remoteJid}_${key.id}`;
  const stored = messageStore.get(storeKey);
  return stored?.message || undefined;
}

// Diretório de autenticação
function getAuthDir(): string {
  const customPath = process.env.DATA_PATH;
  if (customPath) {
    return `${customPath}/auth_info`;
  }
  return './auth_info';
}

const AUTH_DIR = getAuthDir();

// Unique identifier for this worker instance
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// Socket principal
let sock: WASocket | null = null;
let isInitializing = false;
let isConnectedState = false;
let connectionEstablished = false;

// Lock management
let lockRenewalInterval: NodeJS.Timeout | null = null;
const LOCK_DURATION_SECONDS = 180;
const LOCK_RENEWAL_INTERVAL_MS = 90_000;

// v3.9: Heartbeat mais frequente (15s em vez de 2min)
let heartbeatInterval: NodeJS.Timeout | null = null;
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 segundos para detecção rápida
let lastSuccessfulPing: Date | null = null;
let pingFailures = 0;
const MAX_PING_FAILURES = 3;

// Backup
let periodicBackupInterval: NodeJS.Timeout | null = null;
const BACKUP_INTERVAL_MS = 5 * 60_000;

// Reconnection
let reconnectTimeout: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const RECONNECT_BASE_DELAY_MS = 10_000;
const RECONNECT_MAX_DELAY_MS = 120_000;
const RECONNECT_JITTER_MS = 5_000;

// Send stabilization
const SEND_STABILIZATION_MS = 10_000;
let connectedAtMs: number | null = null;
let sendReadyAtMs: number | null = null;

// v3.9: Circuit breaker aprimorado - só bloqueia em LOGOUT real
let autoReconnectBlocked = false;
let autoReconnectBlockedReason: string | null = null;

// v3.9: Cooldown de proteção após erros consecutivos
let consecutiveSendErrors = 0;
let cooldownUntilMs: number | null = null;
const MAX_CONSECUTIVE_ERRORS = 3;
const COOLDOWN_DURATION_MS = 5 * 60_000; // 5 minutos

// ============================================
// Circuit Breaker (v3.9: só bloqueia em LOGOUT real)
// ============================================

function blockAutoReconnect(reason: string): void {
  autoReconnectBlocked = true;
  autoReconnectBlockedReason = reason;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

export function resumeAutoReconnect(reason: string = 'manual_resume'): void {
  if (autoReconnectBlocked) {
    console.log(`🔓 Auto-reconnect reabilitado (${reason}). Motivo anterior: ${autoReconnectBlockedReason}`);
  }
  autoReconnectBlocked = false;
  autoReconnectBlockedReason = null;
  reconnectAttempts = 0;
}

export function isAutoReconnectBlocked(): { blocked: boolean; reason: string | null } {
  return { blocked: autoReconnectBlocked, reason: autoReconnectBlockedReason };
}

// ============================================
// Cooldown de Proteção (v3.9)
// ============================================

export function isInCooldown(): boolean {
  if (!cooldownUntilMs) return false;
  if (Date.now() >= cooldownUntilMs) {
    cooldownUntilMs = null;
    consecutiveSendErrors = 0;
    console.log('✅ Cooldown encerrado, envios liberados');
    return false;
  }
  return true;
}

export function getCooldownStatus(): { inCooldown: boolean; remainingMs: number; consecutiveErrors: number } {
  const inCooldown = isInCooldown();
  const remainingMs = cooldownUntilMs ? Math.max(0, cooldownUntilMs - Date.now()) : 0;
  return { inCooldown, remainingMs, consecutiveErrors: consecutiveSendErrors };
}

function registerSendError(): void {
  consecutiveSendErrors++;
  console.warn(`⚠️ Erro de envio consecutivo: ${consecutiveSendErrors}/${MAX_CONSECUTIVE_ERRORS}`);
  
  if (consecutiveSendErrors >= MAX_CONSECUTIVE_ERRORS) {
    cooldownUntilMs = Date.now() + COOLDOWN_DURATION_MS;
    console.warn(`🛑 COOLDOWN ATIVADO: pausando envios por ${COOLDOWN_DURATION_MS / 1000}s`);
    logEvent('COOLDOWN_ACTIVATED', undefined, {
      workerId: WORKER_ID,
      consecutiveErrors: consecutiveSendErrors,
      cooldownDurationMs: COOLDOWN_DURATION_MS,
    });
  }
}

function registerSendSuccess(): void {
  if (consecutiveSendErrors > 0) {
    console.log(`✅ Envio bem-sucedido, resetando contador de erros (era ${consecutiveSendErrors})`);
  }
  consecutiveSendErrors = 0;
}

// ============================================
// State Management
// ============================================

function resetSendReadiness(): void {
  connectedAtMs = null;
  sendReadyAtMs = null;
  isConnectedState = false;
  connectionEstablished = false;
}

function armSendReadiness(): void {
  connectedAtMs = Date.now();
  sendReadyAtMs = connectedAtMs + SEND_STABILIZATION_MS;
}

function getSendStabilizationRemainingMs(): number {
  if (!sendReadyAtMs) return 0;
  return Math.max(0, sendReadyAtMs - Date.now());
}

function getReconnectDelayMs(): number {
  const exp = Math.min(reconnectAttempts, 4);
  const base = RECONNECT_BASE_DELAY_MS * Math.pow(2, exp);
  const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MS);
  return Math.min(RECONNECT_MAX_DELAY_MS, base) + jitter;
}

// ============================================
// Heartbeat & Lock Renewal
// ============================================

function startHeartbeat(): void {
  stopHeartbeat();
  console.log('💓 Heartbeat iniciado');
  
  heartbeatInterval = setInterval(async () => {
    if (!sock) {
      console.warn('⚠️ Heartbeat: socket é null');
      pingFailures++;
      if (pingFailures >= MAX_PING_FAILURES) {
        console.error('❌ Heartbeat: muitas falhas, tentando reconectar...');
        scheduleReconnect();
      }
      return;
    }

    try {
      // Baileys (tipagem atual) não expõe um readyState confiável.
      // Usamos nosso state machine (isConnectedState) e apenas atualizamos last_seen_at.
      if (!isConnectedState) {
        throw new Error('not_connected');
      }

      pingFailures = 0;
      lastSuccessfulPing = new Date();

      await updateWhatsAppSession({
        last_seen_at: new Date().toISOString(),
      });
    } catch (error) {
      pingFailures++;
      console.warn(`⚠️ Heartbeat falhou (${pingFailures}/${MAX_PING_FAILURES}):`, error);
      
      if (pingFailures >= MAX_PING_FAILURES) {
        console.error('❌ Heartbeat: muitas falhas consecutivas');
        await logEvent('HEARTBEAT_FAILED', undefined, { 
          workerId: WORKER_ID, 
          failures: pingFailures 
        });
        scheduleReconnect();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  pingFailures = 0;
}

function startLockRenewal(): void {
  stopLockRenewal();
  console.log('🔐 Lock renewal iniciado');
  
  lockRenewalInterval = setInterval(async () => {
    const renewed = await renewWhatsAppLock(WORKER_ID, LOCK_DURATION_SECONDS);
    if (!renewed) {
      console.warn('⚠️ Falha ao renovar lock - pode ter sido tomado por outra instância');
      await logEvent('LOCK_RENEW_FAILED', undefined, { workerId: WORKER_ID });
    }
  }, LOCK_RENEWAL_INTERVAL_MS);
}

function stopLockRenewal(): void {
  if (lockRenewalInterval) {
    clearInterval(lockRenewalInterval);
    lockRenewalInterval = null;
  }
}

// ============================================
// Periodic Backup
// ============================================

function startPeriodicBackup(): void {
  stopPeriodicBackup();
  console.log('📦 Backup periódico iniciado');
  
  periodicBackupInterval = setInterval(async () => {
    if (isConnectedState) {
      await backupSession();
    }
  }, BACKUP_INTERVAL_MS);
}

function stopPeriodicBackup(): void {
  if (periodicBackupInterval) {
    clearInterval(periodicBackupInterval);
    periodicBackupInterval = null;
  }
}

// ============================================
// Reconnection
// ============================================

function scheduleReconnect(): void {
  if (autoReconnectBlocked) {
    console.log('🚫 Reconexão bloqueada pelo circuit breaker');
    return;
  }
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  
  const delay = getReconnectDelayMs();
  reconnectAttempts++;
  
  console.log(`🔄 Agendando reconexão em ${delay / 1000}s (tentativa ${reconnectAttempts})...`);
  
  reconnectTimeout = setTimeout(async () => {
    await initializeWhatsApp();
  }, delay);
}

// ============================================
// Connection Handler
// ============================================

async function handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
  const { connection, lastDisconnect, qr } = update;

  // QR Code gerado
  if (qr) {
    console.log('📱 QR Code gerado pelo Baileys');
    
    try {
      // Converter QR para base64
      const qrBase64 = await qrcode.toDataURL(qr, { 
        width: 256, 
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      
      await updateWhatsAppSession({
        status: 'QR_REQUIRED',
        qr_code: qrBase64,
      });
      
      await logEvent('QR_GENERATED', undefined, { 
        workerId: WORKER_ID, 
        qrLength: qrBase64.length 
      });
      
      console.log('✅ QR Code salvo no banco');
    } catch (error) {
      console.error('❌ Erro ao gerar QR:', error);
    }
  }

  // Conexão estabelecida
  if (connection === 'open') {
    if (connectionEstablished) {
      console.log('⚠️ Evento open duplicado ignorado');
      return;
    }
    
    connectionEstablished = true;
    isConnectedState = true;
    reconnectAttempts = 0;
    
    console.log('✅ WhatsApp conectado via Baileys!');
    
    armSendReadiness();
    
    await updateWhatsAppSession({
      status: 'CONNECTED',
      qr_code: null,
      last_seen_at: new Date().toISOString(),
    });
    
    await logEvent('SESSION_CONNECTED', undefined, { 
      workerId: WORKER_ID,
      engine: 'baileys',
      stabilizationEndsAt: sendReadyAtMs,
    });
    
    startHeartbeat();
    startPeriodicBackup();

    // Garantir presença online imediatamente (ajuda a estabilizar entrega)
    try {
      await sock?.sendPresenceUpdate('available');
    } catch (e) {
      console.warn('⚠️ Falha ao enviar presença available ao conectar:', e);
    }
    
    // Backup imediato
    setTimeout(() => backupSession(), 5000);
  }

  // Conexão fechada
  if (connection === 'close') {
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const reason = DisconnectReason[statusCode] || `Unknown (${statusCode})`;
    
    console.log(`🔌 Conexão fechada: ${reason} (code: ${statusCode})`);
    
    stopHeartbeat();
    stopPeriodicBackup();
    resetSendReadiness();
    
    // Logout do usuário - bloqueio do circuit breaker
    if (statusCode === DisconnectReason.loggedOut) {
      console.warn('🧯 LOGOUT detectado - bloqueando reconexão automática');
      
      blockAutoReconnect('LOGGED_OUT');
      
      // Limpar sessão local
      try {
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          console.log('🧹 Sessão local removida');
        }
      } catch (e) {
        console.warn('⚠️ Erro ao limpar sessão:', e);
      }
      
      // Deletar backup
      await deleteBackup();
      
      await releaseWhatsAppLock(WORKER_ID);
      
      await updateWhatsAppSession({
        status: 'DISCONNECTED',
        qr_code: null,
        session_data: null,
      });
      
      await logEvent('HARD_LOGOUT_DETECTED', undefined, {
        workerId: WORKER_ID,
        reason: 'LOGGED_OUT',
        statusCode,
      });
      
      sock = null;
      return;
    }
    
    // Restart necessário - reconexão imediata
    if (statusCode === DisconnectReason.restartRequired) {
      console.log('🔄 Restart necessário - reconectando imediatamente...');
      await initializeWhatsApp();
      return;
    }
    
    // Connection replaced (440) - outra instância assumiu
    // Não atualizar status para DISCONNECTED pois a sessão continua válida
    if (statusCode === 440) {
      console.log('🔄 Conexão substituída por outra instância - aguardando...');
      await logEvent('SESSION_REPLACED', undefined, {
        workerId: WORKER_ID,
        reason: 'connectionReplaced',
        statusCode,
      });
      // Não tentar reconectar imediatamente - deixar a nova instância assumir
      sock = null;
      return;
    }
    
    // v3.10: Erros de serviço temporário (503, 408) - reconexão imediata e agressiva
    const isTemporaryServiceError = statusCode === 503 || statusCode === 408;
    
    if (isTemporaryServiceError) {
      console.log(`🔄 Erro temporário (${statusCode}) - reconexão imediata...`);
      await logEvent('TEMPORARY_SERVICE_ERROR', undefined, {
        workerId: WORKER_ID,
        reason,
        statusCode,
        action: 'immediate_reconnect',
      });
      
      // Liberar lock antes de reconectar para evitar conflito
      stopLockRenewal();
      await releaseWhatsAppLock(WORKER_ID);
      
      sock = null;
      
      // Reconexão imediata após breve pausa (5s)
      setTimeout(async () => {
        console.log('🔄 Tentando reconexão após erro temporário...');
        await initializeWhatsApp();
      }, 5000);
      
      return;
    }
    
    // Outros erros - tentar reconectar com backoff
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
    
    if (shouldReconnect) {
      await updateWhatsAppSession({
        status: 'DISCONNECTED',
        qr_code: null,
      });
      
      await logEvent('SESSION_DISCONNECTED', undefined, {
        workerId: WORKER_ID,
        reason,
        statusCode,
        willReconnect: true,
      });
      
      // Liberar lock antes de agendar reconexão
      stopLockRenewal();
      await releaseWhatsAppLock(WORKER_ID);
      
      scheduleReconnect();
    }
    
    sock = null;
  }
}

// ============================================
// Main Initialization
// ============================================

async function initializeWhatsApp(): Promise<void> {
  if (isInitializing) {
    console.log('⚠️ Já inicializando, ignorando...');
    return;
  }
  
  isInitializing = true;
  console.log(`🚀 Iniciando WhatsApp Baileys (Worker: ${WORKER_ID})...`);
  
  try {
    // Tentar adquirir lock
    const lockAcquired = await acquireWhatsAppLock(WORKER_ID, LOCK_DURATION_SECONDS);
    
    if (!lockAcquired) {
      console.warn('🔒 Lock não adquirido - outra instância está ativa');
      await logEvent('LOCK_ACQUISITION_FAILED', undefined, { workerId: WORKER_ID });
      isInitializing = false;
      return;
    }
    
    await logEvent('LOCK_ACQUIRED', undefined, { workerId: WORKER_ID });
    startLockRenewal();
    
    // Tentar restaurar sessão do backup
    const restored = await restoreSession();
    if (restored) {
      console.log('📦 Sessão restaurada do backup');
    }
    
    // Criar diretório de auth se não existir
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    
    // Carregar estado de autenticação
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
    // Buscar versão mais recente do WhatsApp Web
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📲 Usando WA Web versão: ${version.join('.')}`);
    
    // Criar socket com getMessage store para estabilização de entrega
    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false, // Usamos nosso próprio handler de QR
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true, // Gerar preview de links
      syncFullHistory: false, // Leve, mas com getMessage implementado
      markOnlineOnConnect: true, // IMPORTANTE: Marcar online para garantir entrega
      // getMessage store - faz o WhatsApp confiar mais na sessão
      getMessage: async (key) => {
        const msg = getMessage(key);
        return msg || undefined;
      },
      // Opções de estabilidade
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
      retryRequestDelayMs: 250,
      // Garantir que mensagens não sejam tratadas como temporárias
      options: {
        ephemeralExpiration: 0,
      } as any,
      // v3.8: Browser Identity - simular desktop real para protocolo de entrega otimizado
      browser: ['Mac OS', 'Chrome', '121.0.6167.184'],
      // v3.8: Reenvio automático se primeiro check falhar
      maxMsgRetryCount: 5,
    });
    
    // Event handlers
    sock.ev.on('connection.update', handleConnectionUpdate);
    
    sock.ev.on('creds.update', saveCreds);
    
    // Armazenar mensagens no store (enviadas e recebidas)
    sock.ev.on('messages.upsert', async (m) => {
      for (const msg of m.messages) {
        storeMessage(msg);
        if (m.type === 'notify' && !msg.key.fromMe) {
          console.log(`📩 Mensagem recebida de ${msg.key.remoteJid}`);
        }
      }
    });
    
    console.log('✅ Socket Baileys criado, aguardando eventos...');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar Baileys:', error);
    await logEvent('BAILEYS_INIT_ERROR', undefined, {
      workerId: WORKER_ID,
      error: error instanceof Error ? error.message : String(error),
    });
    
    stopLockRenewal();
    await releaseWhatsAppLock(WORKER_ID);
    
    // Agendar retry
    scheduleReconnect();
  } finally {
    isInitializing = false;
  }
}

// ============================================
// Public API
// ============================================

export async function getWhatsAppClient(): Promise<WASocket> {
  if (!sock || !isConnectedState) {
    await initializeWhatsApp();
    
    // Aguardar conexão (max 60s)
    const maxWait = 60_000;
    const start = Date.now();
    
    while (!isConnectedState && Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (!sock || !isConnectedState) {
      throw new Error('WhatsApp não conectado');
    }
  }
  
  return sock;
}

/**
 * Mantém uma conexão ativa, sem forçar logout/recriação desnecessária.
 * Usado pelo scheduler para "dar start" quando o worker sobe.
 */
export async function ensureConnection(): Promise<void> {
  if (autoReconnectBlocked) return;
  if (sock && isConnectedState) return;
  await initializeWhatsApp();
}

export function getWorkerId(): string {
  return WORKER_ID;
}

export async function isConnected(): Promise<boolean> {
  if (!sock) return false;
  return isConnectedState;
}

export async function checkRealConnection(): Promise<{
  connected: boolean;
  state?: string | null;
  error?: string;
}> {
  try {
    if (!sock) {
      return { connected: false, error: 'Socket não inicializado' };
    }

    const connected = isConnectedState;

    return {
      connected,
      state: connected ? 'connected' : 'disconnected',
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getConnectionStats(): {
  pingFailures: number;
  lastSuccessfulPing: Date | null;
  isHeartbeatRunning: boolean;
  workerId: string;
  isLockRenewalRunning: boolean;
} {
  return {
    pingFailures,
    lastSuccessfulPing,
    isHeartbeatRunning: heartbeatInterval !== null,
    workerId: WORKER_ID,
    isLockRenewalRunning: lockRenewalInterval !== null,
  };
}

export async function isReadyToSend(): Promise<{
  ready: boolean;
  reason?: string;
  remainingMs?: number;
}> {
  if (!sock || !isConnectedState) {
    return { ready: false, reason: 'not_connected' };
  }
  
  const remaining = getSendStabilizationRemainingMs();
  if (remaining > 0) {
    return { ready: false, reason: 'stabilizing', remainingMs: remaining };
  }
  
  return { ready: true };
}

export async function sendMessage(
  phone: string,
  message: string
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  jid?: string;
  verifiedNumber?: string;
  verificationAttempts?: number;
  jidDiffersFromOriginal?: boolean;
}> {
  try {
    if (!sock || !isConnectedState) {
      return { success: false, error: 'WhatsApp não conectado' };
    }
    
    // Aguardar estabilização
    const remaining = getSendStabilizationRemainingMs();
    if (remaining > 0) {
      await new Promise(r => setTimeout(r, remaining));
    }
    
    // Normalizar número (remover caracteres não numéricos)
    let normalized = phone.replace(/\D/g, '');
    
    // Adicionar código do Brasil se não tiver
    if (!normalized.startsWith('55')) {
      normalized = '55' + normalized;
    }
    
    // Gerar variantes do número para verificação
    // Celulares brasileiros podem ter ou não o 9º dígito
    const variants = generatePhoneVariants(normalized);
    console.log(`🔍 Verificando variantes: ${variants.join(', ')}`);
    
    // Tentar encontrar o JID correto verificando todas as variantes
    let jid: string | null = null;
    let verifiedNumber: string | null = null;
    let hadLookupError = false;
    let verificationAttempts = 0;

    // Importante: NÃO usar fallback de JID. Se o onWhatsApp falhar, retornamos erro
    // para evitar envios que ficam presos em 1 check por JID incorreto.
    const MAX_VERIFY_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS && !jid; attempt++) {
      verificationAttempts = attempt;
      let attemptHadError = false;

      for (const variant of variants) {
        try {
          const waLookup = await sock.onWhatsApp(variant);
          const first = Array.isArray(waLookup) ? (waLookup[0] as any) : undefined;

          const exists = Boolean(first?.exists);
          const foundJid = typeof first?.jid === 'string' ? (first.jid as string) : undefined;

          if (exists && foundJid) {
            jid = foundJid;
            verifiedNumber = variant;
            console.log(`✅ Número verificado: ${variant} -> ${jid}`);
            break;
          }
        } catch (lookupError) {
          attemptHadError = true;
          hadLookupError = true;
          console.warn(`⚠️ Erro ao verificar ${variant} (tentativa ${attempt}/${MAX_VERIFY_ATTEMPTS}):`, lookupError);
        }
      }

      if (!jid && attemptHadError && attempt < MAX_VERIFY_ATTEMPTS) {
        const waitMs = 800 * attempt + Math.floor(Math.random() * 400);
        console.warn(`⏳ Verificação instável (tentativa ${attempt}). Aguardando ${waitMs}ms e tentando novamente...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    if (!jid) {
      if (!hadLookupError) {
        console.warn(`❌ Número NÃO encontrado no WhatsApp: ${normalized}`);
        return {
          success: false,
          error: `Número não encontrado no WhatsApp: ${normalized}`,
          verificationAttempts,
        };
      }

      return {
        success: false,
        error:
          'Falha ao verificar o número no WhatsApp (instabilidade/rate-limit). Aguarde 1-2 minutos e tente novamente.',
        verificationAttempts,
      };
    }
    
    // Teste de Eco: verificar se JID retornado é diferente do original
    const originalJid = `${normalized}@s.whatsapp.net`;
    const jidDiffersFromOriginal = jid !== originalJid;
    if (jidDiffersFromOriginal) {
      console.log(`🔄 [ECO] JID diferente do original: ${originalJid} -> ${jid}`);
    }
    
    console.log(`📤 Enviando para ${jid} (verificado: ${verifiedNumber || 'N/A'})...`);
    
    // ============================================
    // v3.8 PRE-SEND WARMUP (presence + readMessages)
    // Aquece o canal e simula abertura do chat
    // ============================================
    
    // 1. Ficar online (presence: available)
    console.log('🟢 [PRE-SEND] Marcando presença como disponível...');
    await sock.sendPresenceUpdate('available', jid);
    
    // 2. Aguardar 3 segundos para sincronização de socket
    await new Promise(r => setTimeout(r, 3000));
    
    // 3. v3.8: Simular "abertura" do chat com readMessages
    // Isso sinaliza ao protocolo que a interface foi acessada, melhorando Delivery Receipts
    console.log('📖 [PRE-SEND] Sinalizando leitura do chat...');
    try {
      // Buscar última mensagem do chat para simular leitura
      await sock.readMessages([{ remoteJid: jid, id: 'dummy', participant: undefined }]);
    } catch (readErr) {
      // Ignorar erro se não houver mensagens para ler - é esperado em novos chats
      console.log('ℹ️ [PRE-SEND] readMessages ignorado (chat novo ou sem mensagens)');
    }
    
    // 4. Começar a digitar (presence: composing)
    console.log('⌨️ [PRE-SEND] Simulando digitação...');
    await sock.sendPresenceUpdate('composing', jid);
    
    // 5. Aguardar mais 3 segundos
    await new Promise(r => setTimeout(r, 3000));
    
    // 6. Parar de digitar
    await sock.sendPresenceUpdate('paused', jid);
    
    // ============================================
    // ENVIO DA MENSAGEM
    // ============================================
    const result = await sock.sendMessage(jid, { 
      text: message,
    });
    
    const messageId = result?.key?.id ?? undefined;
    
    // Armazenar mensagem enviada no store
    if (result) {
      storeMessage(result);
    }
    
    console.log(`✅ Mensagem enviada: ${messageId}`);
    
    // Marcar como disponível após envio
    await sock.sendPresenceUpdate('available');
    
    return {
      success: true,
      messageId,
      jid,
      verifiedNumber: verifiedNumber || undefined,
      verificationAttempts,
      jidDiffersFromOriginal,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Erro ao enviar mensagem:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Gera variantes do número brasileiro para verificação
 * Celulares brasileiros podem estar registrados com ou sem o 9º dígito
 */
function generatePhoneVariants(normalized: string): string[] {
  const variants: string[] = [normalized];
  
  // Formato esperado: 55 + DDD (2 dígitos) + número (8 ou 9 dígitos)
  // Ex: 5531999998888 ou 553199998888
  
  if (normalized.startsWith('55') && normalized.length >= 12) {
    const ddd = normalized.substring(2, 4);
    const number = normalized.substring(4);
    
    // Se tem 9 dígitos no número (começa com 9), testar sem o 9
    if (number.length === 9 && number.startsWith('9')) {
      const withoutNine = `55${ddd}${number.substring(1)}`;
      variants.push(withoutNine);
    }
    
    // Se tem 8 dígitos no número, testar com 9 na frente
    if (number.length === 8) {
      const withNine = `55${ddd}9${number}`;
      variants.push(withNine);
    }
  }
  
  return variants;
}

export async function disconnect(): Promise<void> {
  console.log('🔌 Desconectando WhatsApp...');
  
  stopHeartbeat();
  stopPeriodicBackup();
  stopLockRenewal();
  resetSendReadiness();
  
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      console.warn('⚠️ Erro no logout:', e);
    }
    sock = null;
  }
  
  // Limpar sessão local
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('⚠️ Erro ao limpar auth:', e);
  }
  
  // Deletar backup
  await deleteBackup();
  
  await releaseWhatsAppLock(WORKER_ID);
  
  await updateWhatsAppSession({
    status: 'DISCONNECTED',
    qr_code: null,
    session_data: null,
  });
  
  await logEvent('SESSION_DISCONNECTED', undefined, {
    workerId: WORKER_ID,
    reason: 'manual_disconnect',
  });
  
  console.log('✅ Desconectado');
}

export async function forceClientReset(): Promise<void> {
  console.log('🔄 Forçando reset do cliente...');
  
  stopHeartbeat();
  stopPeriodicBackup();
  resetSendReadiness();
  
  if (sock) {
    try {
      sock.end(undefined);
    } catch (e) {
      // ignore
    }
    sock = null;
  }
  
  connectionEstablished = false;
  isConnectedState = false;
  isInitializing = false;
  
  console.log('✅ Cliente resetado');
}
