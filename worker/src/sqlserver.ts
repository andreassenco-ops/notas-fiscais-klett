/**
 * Importação de dados do SQL Server (Autolac)
 */

import sql from 'mssql';
import { config } from './config';
import {
  upsertQueueItem,
  logEvent,
  updateLastImportAt,
} from './supabase';

// Conexão pool
let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    const sqlConfig: sql.config = {
      user: config.sqlServer.user,
      password: config.sqlServer.password,
      database: config.sqlServer.database,
      server: config.sqlServer.host,
      port: config.sqlServer.port,
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
      },
      options: {
        encrypt: false, // Ajustar conforme necessário
        trustServerCertificate: true,
      },
    };

    pool = await sql.connect(sqlConfig);
    console.log('✅ Conectado ao SQL Server');
  }
  return pool;
}

/**
 * Normaliza número de telefone para formato E.164
 */
function normalizePhone(phone: string): string {
  // Remove tudo que não é dígito
  let cleaned = phone.replace(/\D/g, '');

  // Se não começar com 55, adiciona
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }

  // Formato E.164
  return '+' + cleaned;
}

/**
 * Query placeholder - substituir pela query real do Autolac
 * A query deve retornar:
 * - protocol: identificador único do exame
 * - cpf: CPF do paciente
 * - patient_name: nome do paciente
 * - phone: telefone para envio
 * - result_link: link do resultado
 */
const AUTOLAC_QUERY = `
-- PLACEHOLDER: Substitua esta query pela consulta real do Autolac
-- Exemplo de estrutura esperada:
SELECT 
  CAST(NumeroExame AS VARCHAR(50)) AS protocol,
  REPLACE(REPLACE(CPF, '.', ''), '-', '') AS cpf,
  NomePaciente AS patient_name,
  Telefone AS phone,
  CONCAT('https://resultados.klettlab.com.br/resultado/', NumeroExame) AS result_link
FROM VW_ExamesParaEnvioWhatsApp
WHERE DataLiberacao >= DATEADD(day, -7, GETDATE())
  AND TelefoneValido = 1
ORDER BY DataLiberacao ASC
`;

interface AutolacResult {
  protocol: string;
  cpf: string;
  patient_name: string;
  phone: string;
  result_link: string;
}

/**
 * Executa a importação do SQL Server
 */
export async function runImport(): Promise<{
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
}> {
  const stats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    // Verificar se temos credenciais do SQL Server
    if (!config.sqlServer.user || !config.sqlServer.password) {
      console.log('⚠️ SQL Server não configurado - pulando importação');
      await logEvent('IMPORT_SKIPPED', undefined, {
        reason: 'SQL Server credentials not configured',
      });
      return stats;
    }

    console.log('🔄 Iniciando importação do Autolac...');
    await logEvent('IMPORT_STARTED');

    const db = await getPool();
    const result = await db.request().query<AutolacResult>(AUTOLAC_QUERY);

    stats.total = result.recordset.length;
    console.log(`📊 ${stats.total} registros encontrados no Autolac`);

    for (const row of result.recordset) {
      try {
        // Validar dados mínimos
        if (!row.protocol || !row.cpf || !row.phone) {
          stats.skipped++;
          continue;
        }

        const phone = normalizePhone(row.phone);

        // Validar telefone normalizado
        if (phone.length < 12 || phone.length > 14) {
          console.log(`⚠️ Telefone inválido: ${row.phone} -> ${phone}`);
          stats.skipped++;
          continue;
        }

        const { inserted } = await upsertQueueItem({
          protocol: row.protocol,
          cpf: row.cpf,
          patient_name: row.patient_name,
          phone: phone,
          result_link: row.result_link,
        });

        if (inserted) {
          stats.inserted++;
        } else {
          stats.skipped++;
        }
      } catch (error) {
        console.error(`Erro ao processar registro ${row.protocol}:`, error);
        stats.errors++;
      }
    }

    await updateLastImportAt();

    await logEvent('IMPORT_COMPLETED', undefined, {
      total: stats.total,
      inserted: stats.inserted,
      skipped: stats.skipped,
      errors: stats.errors,
    });

    console.log(
      `✅ Importação concluída: ${stats.inserted} novos, ${stats.skipped} existentes, ${stats.errors} erros`
    );

    return stats;
  } catch (error) {
    console.error('❌ Erro na importação:', error);
    await logEvent('IMPORT_ERROR', undefined, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Fecha a conexão com o SQL Server
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('🔌 Conexão SQL Server fechada');
  }
}
