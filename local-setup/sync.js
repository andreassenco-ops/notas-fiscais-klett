require('dotenv').config();

const sql = require('mssql');
const { Pool } = require('pg');

const sqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DB || 'Autolac',
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.SQLSERVER_PORT || '2789'),
  requestTimeout: 60000,
  connectionTimeout: 30000,
  options: { encrypt: false, trustServerCertificate: true }
};

const pgPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: 'localhost',
  database: process.env.DB_NAME || 'klett',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// ============ MODELO 7 — Resultados (a cada 5min) ============
async function syncModelo7(mssqlPool) {
  console.log(`🔬 [Modelo 7] Sincronizando resultados do dia...`);

  const result = await mssqlPool.request().query(`
    SELECT
      CONCAT(SOL.LOCAL, '-', RIGHT(CONCAT('00000000', SOL.PROTOCOLO), PREF.DIGITOS_PROTOCOLO)) AS PROTOCOLO,
      SOL.DATA,
      CONCAT(SOL.LOCAL, RIGHT(CONCAT('00000000', SOL.PROTOCOLO), PREF.DIGITOS_PROTOCOLO)) AS CODIGO,
      SOL.SENHA_SLINE AS SENHA,
      CAST('http://app.lifesys.com.br/laudos/#/loginAutolacCPF?' + 'codigo=' + (IIF(PREF.DIGITOS_PROTOCOLO = 6, dbo.ToBase64(CONVERT(VARBINARY(MAX),CAST(SOL.LOCAL + DBO.MASCARA(SOL.PROTOCOLO,'000000') AS VARCHAR(8)))), dbo.ToBase64(CONVERT(VARBINARY(MAX),CAST(SOL.LOCAL + DBO.MASCARA(SOL.PROTOCOLO,'00000000') AS VARCHAR(10)))))) + '&senha=' + dbo.ToBase64(CONVERT(VARBINARY(MAX), SOL.SENHA_SLINE)) + '&cpf=' + dbo.ToBase64(CONVERT(VARBINARY(MAX), LEFT(CAST(PAC.CPF AS VARCHAR(100)), 4))) AS VARCHAR(MAX)) AS URL,
      STUFF((SELECT '[[BL]]' + LAUDOS.DESCRICAO FROM SOLICITACAO_EXAMES AS SE2 JOIN LAUDOS ON LAUDOS.ID = SE2.EXAME WHERE SE2.SOLICITACAO_ID = SOL.ID ORDER BY LAUDOS.DESCRICAO FOR XML PATH, TYPE).value('.[1]', 'NVARCHAR(max)'), 1, 6, '') AS EXAMES,
      STUFF((SELECT '[[BL]]' + CONVERT(VARCHAR, LAUDOS.ID) FROM SOLICITACAO_EXAMES AS SE2 JOIN LAUDOS ON LAUDOS.ID = SE2.EXAME WHERE SE2.SOLICITACAO_ID = SOL.ID ORDER BY LAUDOS.DESCRICAO FOR XML PATH, TYPE).value('.[1]', 'NVARCHAR(max)'), 1, 6, '') AS SIGLAS,
      PAC.NOME,
      REPLACE(REPLACE(PAC.CPF, '.', ''), '-', '') AS CPF,
      PAC.CELULAR
    FROM SOLICITACAO AS SOL
      JOIN SOLICITACAO_EXAMES AS SE ON (SE.SOLICITACAO_ID = SOL.ID)
      JOIN PACIENTE AS PAC ON (PAC.ID = SOL.PACIENTE)
      JOIN [AUTOLAC_RASTREABILIDADE].[dbo].[STATUS_ITEMREQUISICAO] AS SR
        ON (SR.LOCAL = SOL.LOCAL) AND (SR.PROTOCOLO = SOL.PROTOCOLO) AND (SE.EXAME = SR.EXAME)
      JOIN LAUDOS ON (LAUDOS.ID = SE.EXAME)
      JOIN PREFERENCIAS AS PREF ON (1 = 1)
    WHERE SR.DATA_HORA >= CAST(GETDATE() AS DATE)
      AND SR.OPERACAO = 'Enviado para a Internet'
      AND PAC.ENVIA_WHATSAPP = 'T'
      AND SE.SITUACAO IN ('A', 'E', 'I', 'D')
      AND SE.SOLICITACAO_ID NOT IN (SELECT SOLICITACAO_ID FROM SOLICITACAO_EXAMES WHERE SITUACAO IN ('P', 'F', 'M'))
      AND PAC.CELULAR IS NOT NULL
      AND LEN(REPLACE(REPLACE(REPLACE(REPLACE(PAC.CELULAR, '(', ''), ')', ''), '-', ''), ' ', '')) >= 10
    GROUP BY SOL.ID, SOL.LOCAL, SOL.PROTOCOLO, PREF.DIGITOS_PROTOCOLO, SOL.DATA,
      PAC.NOME, PAC.CPF, PAC.CELULAR, SOL.SENHA_SLINE
  `);

  let inseridos = 0;
  for (const row of result.recordset) {
    const phone = row.CELULAR.replace(/\D/g, '');

    const res = await pgPool.query(`
      INSERT INTO send_queue (protocol, patient_name, cpf, phone, result_link, model_id, status, sequence_num, variables)
      VALUES ($1, $2, $3, $4, $5, 7, 'PENDING',
        (SELECT COALESCE(MAX(sequence_num), 0) + 1 FROM send_queue),
        $6)
      ON CONFLICT (protocol, cpf, model_id) DO NOTHING
    `, [
      row.PROTOCOLO,
      row.NOME,
      row.CPF,
      phone,
      row.URL,
      JSON.stringify({
        NOME: row.NOME,
        CODIGO: row.CODIGO,
        SENHA: row.SENHA,
        SIGLAS: row.SIGLAS || '',
        EXAMES: row.EXAMES || '',
        URL: row.URL,
        DATA: row.DATA ? new Date(row.DATA).toISOString().split('T')[0] : ''
      })
    ]);
    if (res.rowCount > 0) inseridos++;
  }

  console.log(`✅ [Modelo 7] ${result.recordset.length} encontrados, ${inseridos} novos inseridos.`);
}

// ============ MODELO 14 — Pesquisa de Satisfação (1x/dia às 15h) ============
async function syncModelo14(mssqlPool) {
  console.log(`📋 [Modelo 14] Sincronizando pesquisa de satisfação (mesmo dia, 20% amostragem)...`);

  const result = await mssqlPool.request().query(`
    SELECT sub.PROTOCOLO,
      REPLACE(REPLACE(P.CPF, '.', ''), '-', '') AS CPF,
      P.NOME, P.CELULAR, sub.CONVENIO,
      L.DESCRICAO AS UNIDADE, sub.DATA, sub.EXAMES
    FROM (
      SELECT PROTOCOLO, PACIENTE, LOCAL, CONVENIO, DATA, EXAMES,
        ROW_NUMBER() OVER (PARTITION BY CONVENIO ORDER BY NEWID()) AS rn,
        COUNT(*) OVER (PARTITION BY CONVENIO) AS conv_total
      FROM REQUISICAO
      WHERE CAST(DATA AS DATE) = CAST(GETDATE() AS DATE)
    ) sub
    INNER JOIN PACIENTE P ON sub.PACIENTE = P.ID
    INNER JOIN LOCAL L ON sub.LOCAL = L.ID
    WHERE sub.rn <= CEILING(sub.conv_total * 0.2)

    UNION

    SELECT R.PROTOCOLO,
      REPLACE(REPLACE(P2.CPF, '.', ''), '-', '') AS CPF,
      P2.NOME, P2.CELULAR, R.CONVENIO,
      L2.DESCRICAO AS UNIDADE, R.DATA, R.EXAMES
    FROM REQUISICAO R
    INNER JOIN PACIENTE P2 ON R.PACIENTE = P2.ID
    INNER JOIN LOCAL L2 ON R.LOCAL = L2.ID
    WHERE CAST(R.DATA AS DATE) = CAST(GETDATE() AS DATE)
      AND R.PROTOCOLO IN (
        SELECT DISTINCT RS.PROTOCOLO
        FROM RESULTADOS RS
        INNER JOIN LAUDOS LD ON RS.LAUDO = LD.ID
        WHERE LD.BANCADA = 48
      )
  `);

  let inseridos = 0;
  for (const row of result.recordset) {
    const rawPhone = (row.CELULAR || '').replace(/\D/g, '');
    if (rawPhone.length < 10) continue;

    const protocol = String(row.PROTOCOLO);
    const cpf = row.CPF || '';
    const nome = row.NOME || '';

    const res = await pgPool.query(`
      INSERT INTO send_queue (protocol, patient_name, cpf, phone, result_link, model_id, status, sequence_num, variables)
      VALUES ($1, $2, $3, $4, '', 14, 'PENDING',
        (SELECT COALESCE(MAX(sequence_num), 0) + 1 FROM send_queue),
        $5)
      ON CONFLICT (protocol, cpf, model_id) DO NOTHING
    `, [
      protocol,
      nome,
      cpf,
      rawPhone,
      JSON.stringify({
        NOME: nome,
        CONVENIO: row.CONVENIO || '',
        UNIDADE: row.UNIDADE || '',
        EXAMES: row.EXAMES || '',
        DATA: row.DATA ? new Date(row.DATA).toISOString().split('T')[0] : ''
      })
    ]);
    if (res.rowCount > 0) inseridos++;
  }

  console.log(`✅ [Modelo 14] ${result.recordset.length} encontrados, ${inseridos} novos inseridos.`);
}

// ============ ORQUESTRADOR ============
async function sincronizarFila() {
  let mssqlPool;
  try {
    console.log(`\n⏳ [${new Date().toLocaleTimeString('pt-BR')}] Iniciando sincronização...`);
    mssqlPool = await sql.connect(sqlConfig);

    // Modelo 7 — sempre roda (a cada 5min)
    await syncModelo7(mssqlPool);

    // Modelo 14 — roda 1x por dia, somente a partir das 15h05
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    const hora = agora.getHours();
    const minuto = agora.getMinutes();

    if (hora >= 15 && minuto >= 5) {
      // Verificar no banco se já rodou hoje
      const lockRes = await pgPool.query(
        `SELECT last_query_at FROM models WHERE id = 14`
      );

      const lastRun = lockRes.rows[0]?.last_query_at;
      const lastRunDate = lastRun ? new Date(lastRun).toISOString().split('T')[0] : null;

      if (lastRunDate === hoje) {
        console.log(`⏭️  [Modelo 14] Já executado hoje (${hoje}), pulando.`);
      } else {
        await syncModelo14(mssqlPool);
        // Gravar trava no banco APÓS sucesso
        await pgPool.query(`UPDATE models SET last_query_at = NOW() WHERE id = 14`);
        console.log(`🔒 [Modelo 14] Trava gravada no banco para ${hoje}.`);
      }
    } else {
      console.log(`⏭️  [Modelo 14] Aguardando 15:05 (agora: ${hora}:${String(minuto).padStart(2,'0')}).`);
    }

  } catch (err) {
    console.error('❌ Erro na sincronização:', err.message);
  } finally {
    if (mssqlPool) await mssqlPool.close();
  }
}

// Executa a cada 5 minutos
setInterval(sincronizarFila, 5 * 60 * 1000);
sincronizarFila();
