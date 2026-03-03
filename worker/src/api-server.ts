/**
 * API Server para o Worker v4.1
 * Expõe endpoints HTTP para operações remotas
 */

import http from 'http';
import sql from 'mssql';
import { config } from './config';
// startWhatsAppConnection removida no v4.0 (bot.js cuida dos envios)
import { getWhatsAppSession, updateWhatsAppSession, logEvent, getWhatsAppLockStatus } from './supabase';
import { checkRealConnection, getConnectionStats, isConnected, disconnect, getWorkerId, forceClientReset, resumeAutoReconnect, isAutoReconnectBlocked, sendMessage, getCooldownStatus } from './whatsapp';
import * as pgRoutes from './pg-routes';
import { emitirNFSeFromProtocolo, consultarNFSe, isNfseConfigured, fetchDanfsePdf, NfseResult } from './nfse';

const PORT = process.env.PORT || 3000;

// Conexão pool separada para API
let apiPool: sql.ConnectionPool | null = null;

async function getApiPool(): Promise<sql.ConnectionPool> {
  if (!apiPool || !apiPool.connected) {
    const sqlConfig: sql.config = {
      user: config.sqlServer.user,
      password: config.sqlServer.password,
      database: config.sqlServer.database,
      server: config.sqlServer.host,
      port: config.sqlServer.port,
      // IMPORTANT: node-mssql timeouts are top-level (not inside options)
      connectionTimeout: 30000,
      requestTimeout: 60000,
      pool: {
        max: 3,
        min: 0,
        idleTimeoutMillis: 30000,
      },
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    };

    console.log(`🔄 Conectando ao SQL Server: ${config.sqlServer.host}:${config.sqlServer.port}...`);
    apiPool = await sql.connect(sqlConfig);
    console.log('✅ API Pool conectado ao SQL Server');
  }
  return apiPool;
}

/**
 * Valida se a query é segura (apenas SELECT)
 */
function isQuerySafe(query: string): { safe: boolean; error?: string } {
  const trimmed = query.trim().toUpperCase();
  
  if (!trimmed.startsWith('SELECT')) {
    return { safe: false, error: 'Apenas consultas SELECT são permitidas' };
  }

  const dangerousPatterns = [
    /\bDROP\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION)/i,
    /\bDELETE\s+FROM/i,
    /\bTRUNCATE\s+TABLE/i,
    /\bINSERT\s+INTO/i,
    /\bUPDATE\s+\w+\s+SET/i,
    /\bALTER\s+(TABLE|DATABASE)/i,
    /\bCREATE\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION)/i,
    /\bEXEC\s+\(/i,
    /\bEXECUTE\s+\(/i,
    /\bxp_/i,
    /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC)/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      return { safe: false, error: 'Consulta contém comandos não permitidos' };
    }
  }

  return { safe: true };
}

/**
 * Remove ORDER BY no nível mais externo (para permitir COUNT em subquery)
 */
function stripTopLevelOrderBy(query: string): string {
  const q = query.trim().replace(/;+\s*$/, "");
  const upper = q.toUpperCase();

  let depth = 0;
  for (let i = 0; i < upper.length - 7; i++) {
    const ch = upper[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (depth === 0 && upper.startsWith("ORDER BY", i)) {
      return q.slice(0, i).trim();
    }
  }

  return q;
}

/**
 * Handler para testar queries SQL
 */
async function handleTestQuery(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body = '';
  
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const { sql_query, limit: rawLimit = 10, include_total = true } = JSON.parse(body);

    if (!sql_query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Consulta SQL é obrigatória' }));
      return;
    }

    // Validar query
    const validation = isQuerySafe(sql_query);
    if (!validation.safe) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: validation.error }));
      return;
    }

    // Verificar credenciais
    const missingSqlServerEnv: string[] = [];
    if (!config.sqlServer.host) missingSqlServerEnv.push('SQLSERVER_HOST');
    if (!config.sqlServer.user) missingSqlServerEnv.push('SQLSERVER_USER');
    if (!config.sqlServer.password) missingSqlServerEnv.push('SQLSERVER_PASS');

    if (missingSqlServerEnv.length > 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: `SQL Server não configurado no Worker. Variáveis faltando: ${missingSqlServerEnv.join(', ')}`,
          missing: missingSqlServerEnv,
        })
      );
      return;
    }

    const startTime = Date.now();

    // Clamp do limite (protege o Worker de queries gigantes no modo teste)
    const limit = Math.max(1, Math.min(500, Number(rawLimit) || 10));

    // Query base (sem ; no final)
    const baseQuery = String(sql_query).trim().replace(/;+\s*$/, '');

    // Adicionar TOP para limitar resultados (somente para a prévia)
    let limitedQuery = baseQuery;
    if (!baseQuery.toUpperCase().includes(' TOP ')) {
      limitedQuery = baseQuery.replace(/^SELECT/i, `SELECT TOP ${limit}`);
    }

    console.log(`📝 Executando query (prévia TOP ${limit}): ${limitedQuery.substring(0, 120)}...`);

    let pool: sql.ConnectionPool;
    try {
      pool = await getApiPool();
    } catch (connError) {
      console.error('❌ Erro ao conectar ao SQL Server:', connError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: `Falha na conexão com SQL Server: ${connError instanceof Error ? connError.message : 'Erro desconhecido'}`,
        })
      );
      return;
    }

    // 1) Prévia (limitada)
    const previewResult = await pool.request().query(limitedQuery);

    // 2) Total (sem TOP) — opcional
    let totalRowCount: number | undefined;
    if (include_total) {
      try {
        const countable = stripTopLevelOrderBy(baseQuery);
        const countQuery = `SELECT COUNT(1) AS total FROM (${countable}) AS __q`;
        console.log('🔢 Calculando total (COUNT)...');
        const countResult = await pool.request().query(countQuery);
        const total = (countResult.recordset?.[0] as any)?.total;
        totalRowCount = typeof total === 'number' ? total : Number(total ?? 0);
      } catch (countErr) {
        // Não falha o endpoint só por causa do COUNT
        console.warn('⚠️ Falha ao calcular total (COUNT). Retornando apenas prévia.', countErr);
      }
    }

    const executionTime = Date.now() - startTime;

    // Extrair nomes das colunas
    const columns = previewResult.recordset.length > 0 ? Object.keys(previewResult.recordset[0]) : [];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        columns,
        rows: previewResult.recordset,
        rowCount: previewResult.recordset.length,
        totalRowCount,
        executionTime,
      })
    );
  } catch (error) {
    console.error('Erro ao testar query:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    );
  }
}

/**
 * Handler para iniciar conexão WhatsApp
 */
async function handleStartWhatsApp(res: http.ServerResponse): Promise<void> {
  try {
    // Verificar status atual - mas também verificar conexão real
    const session = await getWhatsAppSession();
    const realConnection = await checkRealConnection();
    
    // Só retornar "já conectado" se a conexão real estiver ativa
    if (session?.status === 'CONNECTED' && realConnection.connected) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'WhatsApp já está conectado', status: 'CONNECTED' }));
      return;
    }

    // ===============================================================
    // IMPORTANTE: Reabilitar auto-reconnect caso tenha sido bloqueado
    // por HARD_LOGOUT. Isso permite que o usuário consiga reconectar
    // após deslogar do aparelho.
    // ===============================================================
    const reconnectStatus = isAutoReconnectBlocked();
    if (reconnectStatus.blocked) {
      console.log(`🔓 Reabilitando auto-reconnect (estava bloqueado por: ${reconnectStatus.reason})`);
      resumeAutoReconnect('api_start');
    }

    // Se o banco diz CONNECTED mas conexão real caiu, forçar reinicialização
    if (session?.status === 'CONNECTED' && !realConnection.connected) {
      console.log('⚠️ Status CONNECTED mas conexão real perdida - forçando reinicialização...');
      await logEvent('FORCE_REINIT', undefined, {
        dbStatus: session.status,
        realState: realConnection.state,
        realError: realConnection.error,
        workerId: getWorkerId(),
      });
      // Forçar reset do cliente para permitir nova inicialização
      await forceClientReset();
    }

    // Atualizar status para QR_REQUIRED antes de iniciar
    await updateWhatsAppSession({
      status: 'QR_REQUIRED',
      qr_code: null,
    });
    await logEvent('QR_REQUESTED');

    // v4.0: WhatsApp é gerenciado pelo bot.js, não pelo worker
    console.log('📱 WhatsApp é gerenciado pelo bot.js (Playwright)');
    

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Conexão WhatsApp iniciada. Aguarde o QR Code.',
      status: 'QR_REQUIRED'
    }));
  } catch (error) {
    console.error('Erro ao iniciar WhatsApp:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }));
  }
}

/**
 * Handler para verificar conexão real do WhatsApp
 */
async function handleWhatsAppStatus(res: http.ServerResponse): Promise<void> {
  try {
    const session = await getWhatsAppSession();
    const realConnection = await checkRealConnection();
    const stats = getConnectionStats();
    const lockStatus = await getWhatsAppLockStatus();
    const reconnectBlocked = isAutoReconnectBlocked();
    
    // Se o banco diz CONNECTED mas a conexão real está perdida, corrigir
    if (session?.status === 'CONNECTED' && !realConnection.connected) {
      console.log('⚠️ Status inconsistente detectado - corrigindo...');
      await updateWhatsAppSession({
        status: 'DISCONNECTED',
        qr_code: null,
      });
      await logEvent('STATUS_CORRECTION', undefined, {
        dbStatus: session.status,
        realState: realConnection.state,
        error: realConnection.error,
        workerId: getWorkerId(),
      });
    }
    
    // v3.9: Incluir status do cooldown de proteção
    const cooldown = getCooldownStatus();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      dbStatus: session?.status || 'UNKNOWN',
      realConnection: realConnection,
      stats: {
        pingFailures: stats.pingFailures,
        lastSuccessfulPing: stats.lastSuccessfulPing?.toISOString() || null,
        isHeartbeatRunning: stats.isHeartbeatRunning,
        workerId: stats.workerId,
        isLockRenewalRunning: stats.isLockRenewalRunning,
      },
      autoReconnect: {
        blocked: reconnectBlocked.blocked,
        reason: reconnectBlocked.reason,
      },
      cooldown: {
        active: cooldown.inCooldown,
        remainingMs: cooldown.remainingMs,
        consecutiveErrors: cooldown.consecutiveErrors,
      },
      lock: lockStatus,
      lastSeenAt: session?.last_seen_at,
    }));
  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
  }
}

/**
 * Handler para desconectar WhatsApp
 */
/**
 * Handler para enviar mensagem manual
 */
async function handleSendMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const { phone, message } = JSON.parse(body);

    if (!phone || !message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'phone e message são obrigatórios' }));
      return;
    }

    console.log(`📤 Enviando mensagem manual para ${phone}...`);
    await logEvent('MANUAL_SEND_ATTEMPT', undefined, { phone, messageLength: message.length, workerId: getWorkerId() });

    const result = await sendMessage(phone, message);

    if (result.success) {
      await logEvent('MANUAL_SEND_SUCCESS', undefined, { phone, messageId: result.messageId, workerId: getWorkerId() });
    } else {
      await logEvent('MANUAL_SEND_FAILED', undefined, { phone, error: result.error, workerId: getWorkerId() });
    }

    res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('Erro ao enviar mensagem manual:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
  }
}

async function handleStopWhatsApp(res: http.ServerResponse): Promise<void> {
  try {
    console.log('🔌 Desconectando WhatsApp via API...');
    
    await disconnect();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'WhatsApp desconectado com sucesso',
    }));
  } catch (error) {
    console.error('Erro ao desconectar WhatsApp:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
  }
}

/**
 * Handler para health check
 */
async function handleHealth(res: http.ServerResponse): Promise<void> {
  const missingSqlServerEnv: string[] = [];
  if (!config.sqlServer.user) missingSqlServerEnv.push('SQLSERVER_USER');
  if (!config.sqlServer.password) missingSqlServerEnv.push('SQLSERVER_PASS');

  // Verificar conexão real do WhatsApp
  let whatsappStatus = 'UNKNOWN';
  let whatsappConnected = false;
  try {
    whatsappConnected = await isConnected();
    const session = await getWhatsAppSession();
    whatsappStatus = session?.status || 'UNKNOWN';
  } catch {
    // ignore
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      sqlServerConfigured: missingSqlServerEnv.length === 0,
      missingSqlServerEnv,
      whatsapp: {
        dbStatus: whatsappStatus,
        reallyConnected: whatsappConnected,
      },
    })
  );
}


// ============================================================
// LAUDO PDF PROXY - Autolac/WMI Solutions
// Based on reverse-engineering from HAR capture
// ============================================================

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

const WMI_API_BASE = 'https://app.wmi.solutions/ws/api/laudos';
const WMI_AUTH_URL = `${WMI_API_BASE}/api/Autenticar`;

interface WMIAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  usuarioId: string;
  token_id: string;  // This is used as header in subsequent requests
}

interface WMILaudoResponse {
  Id: number;
  PacienteId: number;
  InstituicaoId: number;
  Codigo: string;
  NomePaciente: string;
  ResultadoLiberado: string;
  PercExameProcessado: number;
  DiretorioLaudo: string;
  DataUltimoEnvio: string;
}

interface WMILaudosListResponse {
  registros: Array<{
    id: number;
    codigo: string;
    paciente: string;
    percExameProcessado: number;
    diretorioLaudo?: string;
    dataHora?: string;
    dataHoraSolicitacao?: string;
  }>;
}

interface WMILaudoContent {
  idLaudo: number;
  listaRequisicao: Array<{
    protocolo: string;
    paciente: string;
    cpf: string;
    dataNascimento: string;
    listaCabecalho: Array<{
      descricao: string;
      exame: Array<{
        nomeExame: string;
        laudo: string;  // RTF content (may be compressed)
        dataHora: string;
        dataHoraLaudo: string;
      }>;
    }>;
  }>;
}

/**
 * Encode string to Base64
 */
function toBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Normalize the WMI "codigo" (login) to the expected format.
 * 
 * The portal uses a location prefix (e.g. "01", "09", "02") concatenated with the protocol digits.
 * 
 * When the Edge Function already sends LOCAL+PROTOCOLO we keep it as-is.
 * 
 * Examples (expected from Edge Function, already prefixed):
 *  - "09003950" -> "09003950" (local=09, protocolo=003950)
 *  - "01302080" -> "01302080" (local=01, protocolo=302080)
 * 
 * Legacy fallback (raw protocol without prefix):
 *  - "324284"   -> "01324284" (assume local=01)
 */
function normalizeWmiCodigo(raw: string | number): string {
  const input = String(raw ?? '').trim();
  const digits = input.replace(/\D/g, '');

  // If >= 8 digits we assume edge already sent LOCAL(2) + PROTOCOLO(6+)
  if (digits.length >= 8) return digits;

  // If 6-7 digits, assume old format (just protocol) and prefix with "01"
  if (digits.length >= 6) return `01${digits.padStart(6, '0')}`;

  // Otherwise just return as-is (likely invalid but let WMI reject)
  return digits;
}

/**
 * Authenticate with WMI Solutions API using the Autenticar endpoint
 * Based on HAR: POST https://app.wmi.solutions/ws/api/laudos/api/Autenticar
 * 
 * Important: username and password must be Base64 encoded!
 */
async function authenticateWMI(codigo: string, senha: string): Promise<WMIAuthResponse> {
  // IMPORTANT: the WMI endpoint expects "username" = codigo (e.g. 01324284), Base64 encoded.
  console.log(`[WMI Auth] Authenticating with codigo=${codigo}`);

  // Encode credentials as Base64 (as seen in HAR)
  const usernameB64 = toBase64(codigo);
  const passwordB64 = toBase64(senha);
  
  console.log(`[WMI Auth] Base64 encoded: username=${usernameB64}, password=${passwordB64}`);
  
  // Build form data - exactly as seen in HAR
  const formData = new URLSearchParams({
    grant_type: 'password',
    client_id: 'LifeSysLaudos',
    client_secret: 'NHV0MG0zdHIxYzI=',
    username: usernameB64,
    password: passwordB64,
    tipo: 'paciente',
  });

  console.log(`[WMI Auth] POST ${WMI_AUTH_URL}`);

  const response = await fetch(WMI_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://laudos.autolac.com.br',
      'Referer': 'https://laudos.autolac.com.br/',
      'User-Agent': BROWSER_UA,
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WMI Auth] Failed ${response.status}: ${errorText.substring(0, 300)}`);
    throw new Error(`Autenticação falhou: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    console.error(`[WMI Auth] Invalid content-type: ${contentType}, body: ${text.substring(0, 200)}`);
    throw new Error('Resposta de autenticação inválida');
  }

  const authData = await response.json() as WMIAuthResponse;
  
  if (!authData.token_id || !authData.access_token) {
    console.error('[WMI Auth] Missing token_id or access_token in response:', JSON.stringify(authData));
    throw new Error('Token não recebido na autenticação');
  }

  console.log(`[WMI Auth] Success! token_id=${authData.token_id.substring(0, 8)}..., usuarioId=${authData.usuarioId}`);
  return authData;
}

/**
 * Get laudo info using the Patient/Laudos endpoint
 * Based on HAR: GET /api/Paciente/Laudos?codigo=01324284&psw=001884588
 */
async function getLaudoInfoWMI(tokenId: string, accessToken: string, protocolo: string, senha: string): Promise<WMILaudoResponse> {
  const url = `${WMI_API_BASE}/api/Paciente/Laudos?codigo=${protocolo}&psw=${senha}`;
  
  console.log(`[WMI Laudo] Getting laudo info: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${accessToken}`,
      'tokenid': tokenId,
      'access-control-allow-headers': tokenId,
      'Origin': 'https://laudos.autolac.com.br',
      'Referer': 'https://laudos.autolac.com.br/',
      'User-Agent': BROWSER_UA,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WMI Laudo] Info failed ${response.status}: ${errorText.substring(0, 200)}`);
    throw new Error(`Erro ao obter informações do laudo: ${response.status}`);
  }

  const data = await response.json() as WMILaudoResponse;
  console.log(`[WMI Laudo] Got info: Id=${data.Id}, PacienteId=${data.PacienteId}, Liberado=${data.ResultadoLiberado}`);
  
  return data;
}

/**
 * List all laudos for a patient (used to fetch other protocols available within the same login).
 * Based on HAR:
 * POST https://app.wmi.solutions/ws/api/laudos/api/Paciente/{PacienteId}/Laudos?IdInstituicao=18&pagina=1&quantidade=20
 */
async function listPacienteLaudosWMI(
  tokenId: string,
  accessToken: string,
  pacienteId: number,
  instituicaoId: number,
): Promise<WMILaudosListResponse> {
  const url = `${WMI_API_BASE}/api/Paciente/${pacienteId}/Laudos?IdInstituicao=${instituicaoId}&pagina=1&quantidade=20`;

  // Broad range to include older protocols
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 10);

  const fmt = (d: Date, endOfDay: boolean) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = endOfDay ? '23' : '00';
    const mi = endOfDay ? '59' : '00';
    const ss = endOfDay ? '59' : '00';
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  };

  const body = {
    dataFim: fmt(now, true),
    dataInicio: fmt(start, false),
    novos: false,
    paciente: null,
    pacienteCpf: null,
  };

  console.log(`[WMI Laudos] Listing patient laudos: pacienteId=${pacienteId}, instituicaoId=${instituicaoId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${accessToken}`,
      'tokenid': tokenId,
      'access-control-allow-headers': tokenId,
      'Content-Type': 'application/json;charset=UTF-8',
      'Origin': 'https://laudos.autolac.com.br',
      'Referer': 'https://laudos.autolac.com.br/',
      'User-Agent': BROWSER_UA,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WMI Laudos] List failed ${response.status}: ${errorText.substring(0, 200)}`);
    throw new Error(`Erro ao listar laudos do paciente: ${response.status}`);
  }

  const data = (await response.json()) as WMILaudosListResponse;
  console.log(`[WMI Laudos] List size: ${data?.registros?.length ?? 0}`);
  return data;
}

/**
 * Download the actual laudo content (RTF data)
 * Based on HAR: GET /api/Laudo/Get?idlaudo=24205364
 */
async function downloadLaudoContentWMI(tokenId: string, accessToken: string, laudoId: number): Promise<WMILaudoContent> {
  const url = `${WMI_API_BASE}/api/Laudo/Get?idlaudo=${laudoId}`;
  
  console.log(`[WMI Laudo] Downloading content for laudoId=${laudoId}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${accessToken}`,
      'tokenid': tokenId,
      'access-control-allow-headers': tokenId,
      'Origin': 'https://laudos.autolac.com.br',
      'Referer': 'https://laudos.autolac.com.br/',
      'User-Agent': BROWSER_UA,
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao baixar conteúdo do laudo: ${response.status}`);
  }

  const data = await response.json() as WMILaudoContent;
  console.log(`[WMI Laudo] Content downloaded, size: ${JSON.stringify(data).length} chars`);
  
  return data;
}

/**
 * Main handler for laudo PDF requests
 */
async function handleLaudoPdf(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const { protocolo, senhaSline, targetProtocolo } = JSON.parse(body);

    if (!protocolo || !senhaSline) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'protocolo e senhaSline são obrigatórios' }));
      return;
    }

    // Login codigo is derived from the provided protocolo (or already-prefixed input like 01324284)
    const loginCodigo = normalizeWmiCodigo(protocolo);
    const targetCodigo = normalizeWmiCodigo(targetProtocolo ?? protocolo);

    // Ensure senha is properly formatted (9 digits with leading zeros based on HAR)
    const senhaFormatted = String(senhaSline).replace(/\D/g, '').padStart(9, '0');

    console.log(`[LaudoPDF] Request: loginCodigo=${loginCodigo}, targetCodigo=${targetCodigo}`);

    // Step 1: Authenticate using login credentials
    const auth = await authenticateWMI(loginCodigo, senhaFormatted);

    // Step 2: Get login laudo info (also provides PacienteId / InstituicaoId)
    const loginLaudoInfo = await getLaudoInfoWMI(auth.token_id, auth.access_token, loginCodigo, senhaFormatted);

    // Step 3: Resolve which laudoId to download
    let laudoIdToDownload = loginLaudoInfo.Id;
    let codigoResolved = loginLaudoInfo.Codigo;
    let percentualResolved = loginLaudoInfo.PercExameProcessado;
    let nomePacienteResolved = loginLaudoInfo.NomePaciente;

    if (targetCodigo !== loginCodigo) {
      const list = await listPacienteLaudosWMI(
        auth.token_id,
        auth.access_token,
        loginLaudoInfo.PacienteId,
        loginLaudoInfo.InstituicaoId,
      );

      const found = list?.registros?.find((r) => String(r.codigo) === targetCodigo);
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: `Protocolo alvo não encontrado dentro do login informado: ${targetCodigo}`,
            available: (list?.registros ?? []).map((r) => r.codigo),
          })
        );
        return;
      }

      laudoIdToDownload = found.id;
      codigoResolved = found.codigo;
      percentualResolved = found.percExameProcessado;
      nomePacienteResolved = found.paciente || nomePacienteResolved;
    }

    // If processing is not complete, return 202 (matches existing frontend expectation)
    if (typeof percentualResolved === 'number' && percentualResolved < 100) {
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'Resultado ainda não liberado',
          percentual: percentualResolved,
        })
      );
      return;
    }

    // Step 4: Download laudo content (returns JSON with RTF data)
    const laudoContent = await downloadLaudoContentWMI(auth.token_id, auth.access_token, laudoIdToDownload);

    // Return the laudo content as JSON
    // The frontend will handle RTF parsing and PDF generation
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      laudoInfo: {
        id: laudoIdToDownload,
        pacienteId: loginLaudoInfo.PacienteId,
        codigo: codigoResolved,
        nomePaciente: nomePacienteResolved,
        percentual: percentualResolved,
      },
      content: laudoContent,
    }));

  } catch (error) {
    console.error('[LaudoPDF] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
  }
}

// ─── NFS-e Handlers ───

async function handleNfseEmitir(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const params = JSON.parse(body);
    const { protocolo, pacienteNome, cpf, valor, formaPagamento, observacao, ambiente } = params;

    if (!protocolo || !pacienteNome || !cpf || !valor) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Campos obrigatórios: protocolo, pacienteNome, cpf, valor' }));
      return;
    }

    // Gerar nDPS sequencial baseado em timestamp
    const nDPS = String(Date.now()).slice(-10);

    const result = await emitirNFSeFromProtocolo({
      protocolo,
      pacienteNome,
      cpf,
      valor: Number(valor),
      formaPagamento,
      observacao,
      ambiente: ambiente || 2,
      nDPS,
    });

    res.writeHead(result.success ? 200 : 422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('❌ Erro no handler NFS-e:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
  }
}

async function handleNfseEmitirLote(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const { items, ambiente } = JSON.parse(body);

    if (!Array.isArray(items) || items.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'items deve ser um array não vazio' }));
      return;
    }

    const results: Array<{ protocolo: string; success: boolean; chNFSe?: string; nNFSe?: string; nDPS?: string; xmlRetorno?: string; error?: string; jaEmitida?: boolean; detalhes?: unknown; dados?: { pacienteNome: string; cpf: string; valor: number; formaPagamento?: string } }> = [];
    let emitidas = 0;
    let erros = 0;

    for (const item of items) {
      const nDPS = String(Date.now()).slice(-10);
      const result = await emitirNFSeFromProtocolo({
        protocolo: item.protocolo,
        pacienteNome: item.pacienteNome,
        cpf: item.cpf,
        valor: Number(item.valor),
        formaPagamento: item.formaPagamento,
        ambiente: ambiente || 2,
        nDPS,
      });

      results.push({
        protocolo: item.protocolo,
        success: result.success,
        chNFSe: result.chNFSe,
        nNFSe: result.nNFSe,
        nDPS: result.nDPS || nDPS,
        xmlRetorno: result.xmlRetorno,
        error: result.error,
        jaEmitida: result.jaEmitida,
        detalhes: result.detalhes,
        dados: {
          pacienteNome: item.pacienteNome,
          cpf: item.cpf,
          valor: Number(item.valor),
          formaPagamento: item.formaPagamento,
        },
      });

      if (result.success) emitidas++;
      else erros++;

      // Delay entre emissões para não sobrecarregar a API
      if (items.indexOf(item) < items.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      results,
      total: items.length,
      emitidas,
      erros,
    }));
  } catch (error) {
    console.error('❌ Erro no handler NFS-e Lote:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
  }
}

async function handleNfseDanfse(url: URL, res: http.ServerResponse): Promise<void> {
  const chave = url.searchParams.get('chave');
  const ambiente = Number(url.searchParams.get('ambiente') || '1') as 1 | 2;

  if (!chave) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Parâmetro chave é obrigatório' }));
    return;
  }

  try {
    const result = await fetchDanfsePdf(chave, ambiente);
    res.writeHead(result.success ? 200 : 422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('❌ Erro ao buscar DANFSE:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }));
  }
}

/**
 * CORS headers
 */
function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
}

/**
 * Inicia o servidor HTTP
 */
export function startApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    try {
      // ─── Existing routes ───
      if (url.pathname === '/health' && req.method === 'GET') {
        await handleHealth(res);
      } else if (url.pathname === '/api/test-query' && req.method === 'POST') {
        await handleTestQuery(req, res);
      } else if (url.pathname === '/api/whatsapp/start' && req.method === 'POST') {
        await handleStartWhatsApp(res);
      } else if (url.pathname === '/api/whatsapp/status' && req.method === 'GET') {
        await handleWhatsAppStatus(res);
      } else if (url.pathname === '/api/whatsapp/stop' && req.method === 'POST') {
        await handleStopWhatsApp(res);
      } else if (url.pathname === '/api/whatsapp/send' && req.method === 'POST') {
        await handleSendMessage(req, res);
      } else if ((url.pathname === '/api/laudo-pdf' || url.pathname === '/api/download-laudo') && req.method === 'POST') {
        await handleLaudoPdf(req, res);

      // ─── NFS-e Nacional ───
      } else if (url.pathname === '/api/nfse/status' && req.method === 'GET') {
        setCorsHeaders(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ configured: isNfseConfigured() }));
      } else if (url.pathname === '/api/nfse/emitir' && req.method === 'POST') {
        await handleNfseEmitir(req, res);
      } else if (url.pathname === '/api/nfse/emitir-lote' && req.method === 'POST') {
        await handleNfseEmitirLote(req, res);
      } else if (url.pathname === '/api/nfse/danfse' && req.method === 'GET') {
        await handleNfseDanfse(url, res);

      // ─── PostgreSQL local routes (replaces Supabase SDK) ───
      } else if (url.pathname === '/api/pg/queue-stats' && req.method === 'GET') {
        await pgRoutes.handleQueueStats(req, res);
      } else if (url.pathname === '/api/pg/send-queue' && req.method === 'GET') {
        await pgRoutes.handleSendQueue(req, res);
      } else if (url.pathname === '/api/pg/resend' && req.method === 'POST') {
        await pgRoutes.handleResendMessage(req, res);
      } else if (url.pathname === '/api/pg/settings' && req.method === 'GET') {
        await pgRoutes.handleGetSettings(req, res);
      } else if (url.pathname === '/api/pg/settings' && req.method === 'PUT') {
        await pgRoutes.handleUpdateSettings(req, res);
      } else if (url.pathname === '/api/pg/models' && req.method === 'GET') {
        await pgRoutes.handleGetModels(req, res);
      } else if (url.pathname === '/api/pg/models/one' && req.method === 'GET') {
        await pgRoutes.handleGetModel(req, res);
      } else if (url.pathname === '/api/pg/models' && req.method === 'PUT') {
        await pgRoutes.handleUpdateModel(req, res);
      } else if (url.pathname === '/api/pg/model-messages' && req.method === 'GET') {
        await pgRoutes.handleGetModelMessages(req, res);
      } else if (url.pathname === '/api/pg/model-messages' && req.method === 'POST') {
        await pgRoutes.handleUpsertModelMessage(req, res);
      } else if (url.pathname === '/api/pg/model-messages' && req.method === 'PUT') {
        await pgRoutes.handleUpdateModelMessage(req, res);
      } else if (url.pathname === '/api/pg/model-messages' && req.method === 'DELETE') {
        await pgRoutes.handleDeleteModelMessage(req, res);
      } else if (url.pathname === '/api/pg/monthly-stats' && req.method === 'GET') {
        await pgRoutes.handleMonthlyStats(req, res);
      } else if (url.pathname === '/api/pg/whatsapp-session' && req.method === 'GET') {
        await pgRoutes.handleGetWhatsAppSession(req, res);
      } else if (url.pathname === '/api/pg/last-sync' && req.method === 'GET') {
        await pgRoutes.handleLastSyncStatus(req, res);
      } else if (url.pathname === '/api/pg/historical-sends' && req.method === 'GET') {
        await pgRoutes.handleHistoricalSends(req, res);
      } else if (url.pathname === '/api/pg/historical-stats' && req.method === 'GET') {
        await pgRoutes.handleHistoricalStats(req, res);
      } else if (url.pathname === '/api/pg/sent-phones' && req.method === 'GET') {
        await pgRoutes.handleSentPhones(req, res);
      } else if (url.pathname === '/api/pg/admin' && req.method === 'POST') {
        await pgRoutes.handleAdminApi(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('Erro no servidor:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`🌐 API Server rodando na porta ${PORT}`);
  });

  return server;
}

/**
 * Fecha a conexão do pool da API
 */
export async function closeApiPool(): Promise<void> {
  if (apiPool) {
    await apiPool.close();
    apiPool = null;
    console.log('🔌 API Pool fechado');
  }
}
