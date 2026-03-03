/**
 * Logger - grava logs no PostgreSQL local e no console
 */
const { horaBrasilia } = require('./utils');

function createLogger(pool) {
  return async function gravarLog(queueItem, status, detalhesErro = null) {
    const timestamp = horaBrasilia();
    try {
      await pool.query(
        `INSERT INTO send_logs (queue_id, event, details, created_at)
         VALUES ($1::uuid, $2, $3, NOW())`,
        [
          queueItem.id,
          status === 'SUCESSO' ? 'SENT' : 'ERROR',
          JSON.stringify({
            nome: queueItem.patient_name || 'N/A',
            telefone: queueItem.phone,
            protocolo: queueItem.protocol,
            horario_disparo: timestamp,
            status_final: status,
            erro: detalhesErro,
          }),
        ]
      );

      if (status === 'SUCESSO') {
        console.log(`✅ [${timestamp}] Concluído: ${queueItem.patient_name}`);
      } else {
        console.log(`❌ [${timestamp}] Erro em ${queueItem.patient_name}: ${detalhesErro}`);
      }
    } catch (e) {
      console.error('⚠️ Falha ao gravar log:', e.message);
    }
  };
}

module.exports = { createLogger };
