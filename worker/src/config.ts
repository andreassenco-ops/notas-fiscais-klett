/**
 * Configurações do Worker - Klett Whats Sender
 * Todas as variáveis são carregadas do ambiente (Railway)
 */

export const config = {
  // Backend (Lovable Cloud)
  get supabase() {
    return {
      url: process.env.SUPABASE_URL!,
      apiKey:
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        '',
    };
  },

  // SQL Server (Autolac)
  get sqlServer() {
    return {
      host: process.env.SQLSERVER_HOST || process.env.MSSQL_SERVER || 'localhost',
      port: parseInt(process.env.SQLSERVER_PORT || process.env.MSSQL_PORT || '1433'),
      database: process.env.SQLSERVER_DB || process.env.MSSQL_DB || 'Autolac',
      user: process.env.SQLSERVER_USER || process.env.MSSQL_USER || '',
      password: process.env.SQLSERVER_PASS || process.env.MSSQL_PASSWORD || '',
    };
  },

  timezone: process.env.TZ || 'America/Sao_Paulo',

  get sendWindow() {
    return {
      start: process.env.SEND_WINDOW_START || '06:00',
      end: process.env.SEND_WINDOW_END || '21:00',
    };
  },

  get delay() {
    return {
      min: parseInt(process.env.DELAY_MIN || '50'),
      max: parseInt(process.env.DELAY_MAX || '130'),
    };
  },

  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '1'),

  intervals: {
    queueProcessor: 10000,
    sessionCheck: 30000,
  },
};

function keyKind(key: string) {
  if (!key) return 'missing';
  if (key.startsWith('sb_')) return 'sb_*';
  if (key.startsWith('eyJ')) return 'jwt_*';
  return 'unknown';
}

// Validação de configuração obrigatória
export function isSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY
  );
}

export function validateConfig(): void {
  if (isSupabaseConfigured()) {
    console.log('✅ Supabase configurado');
    console.log(`🔐 Backend key detectada: ${keyKind(config.supabase.apiKey)} (len=${config.supabase.apiKey.length})`);
  } else {
    console.log('⚠️  Supabase não configurado — logs remotos desabilitados (modo 100% local)');
  }
  console.log('✅ Configuração validada com sucesso');
}
