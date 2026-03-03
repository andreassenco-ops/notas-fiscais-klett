/**
 * Executor de consultas SQL dos modelos
 * Executa as queries dos modelos ativos e empilha resultados na fila
 * v5: Usa PostgreSQL local ao invés de Supabase Cloud
 */

import { getPgPool } from './pg-routes';
import { getPool } from './sqlserver';
import { config } from './config';

// Interface para modelo
interface Model {
  id: number;
  name: string;
  sql_query: string | null;
  is_active: boolean;
  query_interval_minutes: number;
  last_query_at: string | null;
  delay_min_seconds: number;
  delay_max_seconds: number;
}

/**
 * Busca todos os modelos ativos (PostgreSQL local)
 */
async function getActiveModels(): Promise<Model[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM models WHERE is_active = true AND sql_query IS NOT NULL`
  );
  return rows as Model[];
}

/**
 * Verifica se é hora de executar a query do modelo
 * Modelo 14: horário fixo às 15:00 (1x/dia)
 * Outros modelos: intervalo em minutos desde última execução
 */
/**
 * Retorna data e hora em São Paulo (UTC-3)
 */
function getSaoPauloNow(): { date: string; hour: number } {
  const now = new Date();
  // Formatar em São Paulo timezone
  const spDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
  const spHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
  );
  return { date: spDate, hour: spHour };
}

function shouldExecuteModel(model: Model): boolean {
  // Modelo 14 — horário fixo às 12:00 (São Paulo), 1x por dia
  if (model.id === 14) {
    const sp = getSaoPauloNow();

    // Só executa a partir das 12:00 SP
    if (sp.hour < 12) return false;

    // Verificar se já rodou hoje (comparar em SP timezone)
    if (model.last_query_at) {
      const lastRunSP = new Date(model.last_query_at).toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      });
      if (lastRunSP === sp.date) return false; // Já rodou hoje
    }

    return true;
  }

  // Outros modelos — intervalo padrão
  if (!model.last_query_at) {
    return true;
  }

  const lastQuery = new Date(model.last_query_at);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastQuery.getTime()) / (1000 * 60);

  return diffMinutes >= model.query_interval_minutes;
}

/**
 * Atualiza o timestamp da última execução do modelo (PostgreSQL local)
 */
async function updateModelLastQueryAt(modelId: number): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE models SET last_query_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [modelId]
  );
}

/**
 * Normaliza número de telefone para formato WhatsApp
 */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  if (digits.length <= 11) {
    digits = '55' + digits;
  }
  return digits;
}

/**
 * Valida se o telefone é válido
 */
function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone);
  return digits.length >= 12 && digits.length <= 13;
}

/**
 * Registra evento no log (PostgreSQL local)
 */
async function logEventLocal(
  event: string,
  queueId?: string,
  details?: Record<string, unknown>
): Promise<void> {
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

/**
 * Executa a query SQL de um modelo e empilha os resultados (PostgreSQL local)
 */
async function executeModelQuery(model: Model): Promise<{
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
}> {
  const stats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  if (!model.sql_query) {
    console.log(`⚠️ Modelo ${model.id} (${model.name}) não tem query SQL definida`);
    return stats;
  }

  console.log(`🔄 Executando query do modelo ${model.id} (${model.name})...`);

  try {
    const sqlPool = await getPool();
    const result = await sqlPool.request().query(model.sql_query);
    const rows = result.recordset || [];
    stats.total = rows.length;

    console.log(`📊 Modelo ${model.id}: ${rows.length} registros retornados`);

    const pgPool = getPgPool();

    for (const row of rows) {
      try {
        const protocol = row.PROTOCOLO || row.protocolo || row.protocol || '';
        const cpf = row.CPF || row.cpf || '';
        const name = row.NOME || row.nome || row.patient_name || '';
        const phone = row.CELULAR || row.celular || row.phone || row.telefone || '';

        if (!protocol || !cpf) {
          console.log(`⚠️ Registro sem protocolo ou CPF, ignorando`);
          stats.skipped++;
          continue;
        }

        if (!phone || !isValidPhone(phone)) {
          console.log(`⚠️ Telefone inválido para protocolo ${protocol}: ${phone}`);
          stats.skipped++;
          continue;
        }

        const normalizedPhone = normalizePhone(phone);

        // Preparar variáveis do modelo (todos os campos retornados)
        const variables: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          variables[key.toUpperCase()] = String(value ?? '');
        }

        const scheduledDate = row.DATA || row.data || row.scheduled_date || new Date().toISOString().split('T')[0];
        const resultLink = row.URL || row.url || row.result_link || '';

        // INSERT com ON CONFLICT para deduplicação (PostgreSQL local)
        const res = await pgPool.query(`
          INSERT INTO send_queue (protocol, cpf, patient_name, phone, result_link, model_id, status, sequence_num, variables, scheduled_date)
          VALUES ($1, $2, $3, $4, $5, $6, 'PENDING',
            (SELECT COALESCE(MAX(sequence_num), 0) + 1 FROM send_queue),
            $7, $8)
          ON CONFLICT (protocol, cpf, model_id) DO NOTHING
        `, [
          String(protocol),
          String(cpf),
          name || 'Paciente',
          normalizedPhone,
          resultLink,
          model.id,
          JSON.stringify(variables),
          scheduledDate,
        ]);

        if (res.rowCount && res.rowCount > 0) {
          stats.inserted++;
        } else {
          stats.skipped++;
        }
      } catch (rowError) {
        console.error('❌ Erro ao processar registro:', rowError);
        stats.errors++;
      }
    }

    // Atualizar timestamp da última execução
    await updateModelLastQueryAt(model.id);

    console.log(
      `✅ Modelo ${model.id} processado: ${stats.inserted} inseridos, ${stats.skipped} ignorados, ${stats.errors} erros`
    );

    await logEventLocal('MODEL_QUERY_EXECUTED', undefined, {
      model_id: model.id,
      model_name: model.name,
      ...stats,
    });

    return stats;
  } catch (error) {
    console.error(`❌ Erro ao executar query do modelo ${model.id}:`, error);
    await logEventLocal('MODEL_QUERY_ERROR', undefined, {
      model_id: model.id,
      model_name: model.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Executa as queries de todos os modelos ativos que estão na hora
 */
export async function runModelQueries(): Promise<void> {
  if (!config.sqlServer.user || !config.sqlServer.password) {
    console.log('⚠️ SQL Server não configurado, pulando execução de modelos');
    return;
  }

  const models = await getActiveModels();

  if (models.length === 0) {
    console.log('📭 Nenhum modelo ativo encontrado');
    return;
  }

  console.log(`📋 ${models.length} modelo(s) ativo(s) encontrado(s)`);

  let totalStats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  for (const model of models) {
    if (!shouldExecuteModel(model)) {
      if (model.id === 14) {
        const sp = getSaoPauloNow();
        if (sp.hour < 12) {
          console.log(`⏳ Modelo ${model.id} (${model.name}): aguardando 12:00 SP (agora: ${sp.hour}h)`);
        } else {
          console.log(`⏭️  Modelo ${model.id} (${model.name}): já executado hoje (${sp.date})`);
        }
      } else {
        const nextRun = new Date(model.last_query_at!);
        nextRun.setMinutes(nextRun.getMinutes() + model.query_interval_minutes);
        console.log(
          `⏳ Modelo ${model.id} (${model.name}): próxima execução em ${nextRun.toLocaleTimeString('pt-BR')}`
        );
      }
      continue;
    }

    try {
      const stats = await executeModelQuery(model);
      totalStats.total += stats.total;
      totalStats.inserted += stats.inserted;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
    } catch (error) {
      console.error(`❌ Falha ao executar modelo ${model.id}:`, error);
    }
  }

  if (totalStats.total > 0) {
    console.log(
      `📊 Total geral: ${totalStats.total} registros, ${totalStats.inserted} inseridos, ${totalStats.skipped} ignorados, ${totalStats.errors} erros`
    );
  }
}

/**
 * Busca uma mensagem aleatória do modelo para usar no envio (PostgreSQL local)
 */
export async function getModelMessageForSending(modelId: number): Promise<string | null> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT body FROM model_messages WHERE model_id = $1 AND is_active = true`,
    [modelId]
  );
  if (rows.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * rows.length);
  return rows[randomIndex].body;
}

/**
 * Substitui variáveis na mensagem com os valores do item
 */
export function replaceVariables(
  messageBody: string,
  variables: Record<string, string>
): string {
  let result = messageBody;

  for (const [key, value] of Object.entries(variables)) {
    const patterns = [
      new RegExp(`\\[\\[${key}\\]\\]`, 'gi'),
      new RegExp(`\\{${key}\\}`, 'gi'),
    ];

    for (const pattern of patterns) {
      result = result.replace(pattern, value);
    }
  }

  return result;
}
