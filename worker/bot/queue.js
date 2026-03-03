/**
 * Gerenciamento da fila de envio (PostgreSQL local)
 * Prioridade: Modelo 7 (Resultados) primeiro, depois os demais
 */

// Mapa de nomes dos modelos
const MODEL_NAMES = {
  7: 'Resultados',
  14: 'Pesquisa',
};

function getModelLabel(modelId) {
  const name = MODEL_NAMES[modelId] || `Modelo ${modelId}`;
  return `${name} (M${String(modelId).padStart(2, '0')})`;
}

function createQueue(pool, cfg) {
  /** Busca contagens de PENDING por grupo */
  async function getCounts() {
    const [m7Res, othersRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS c FROM send_queue WHERE status = 'PENDING' AND model_id = 7 AND attempts < $1`,
        [cfg.maxAttempts]
      ),
      pool.query(
        `SELECT COUNT(*) AS c FROM send_queue WHERE status = 'PENDING' AND model_id != 7 AND attempts < $1`,
        [cfg.maxAttempts]
      ),
    ]);
    return {
      m7: parseInt(m7Res.rows[0].c) || 0,
      others: parseInt(othersRes.rows[0].c) || 0,
    };
  }

  /** Verifica se já foi enviado hoje (anti-duplicata via send_logs) */
  async function alreadySentToday(queueId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { rows } = await pool.query(
      `SELECT id FROM send_logs WHERE queue_id = $1::uuid AND event = 'SENT' AND created_at >= $2 LIMIT 1`,
      [queueId, today.toISOString()]
    );
    return rows.length > 0;
  }

  /** Busca próximo item PENDING (prioriza modelo 7) */
  async function next() {
    // 1. Modelo 7 primeiro
    let { rows } = await pool.query(
      `SELECT * FROM send_queue WHERE status = 'PENDING' AND model_id = 7 AND attempts < $1
       ORDER BY sequence_num ASC LIMIT 1`,
      [cfg.maxAttempts]
    );

    // 2. Fallback: qualquer outro modelo
    if (rows.length === 0) {
      const res = await pool.query(
        `SELECT * FROM send_queue WHERE status = 'PENDING' AND model_id != 7 AND attempts < $1
         ORDER BY sequence_num ASC LIMIT 1`,
        [cfg.maxAttempts]
      );
      rows = res.rows;
    }

    if (rows.length === 0) return null;

    const item = rows[0];

    // Anti-duplicata: checar se já enviou este item hoje
    const sent = await alreadySentToday(item.id);
    if (sent) {
      console.log(`⚠️ [DEDUP] ${item.protocol} (M${item.model_id}) já enviado hoje — marcando SKIPPED`);
      await pool.query(
        `UPDATE send_queue SET status = 'SKIPPED', error_message = 'Duplicata: já enviado hoje' WHERE id = $1::uuid`,
        [item.id]
      );
      return next(); // Buscar próximo
    }

    // Buscar contagens para exibição
    const counts = await getCounts();

    return { item, counts };
  }

  /** Marca como enviado */
  async function markSent(id) {
    await pool.query(
      `UPDATE send_queue SET status = 'SENT', sent_at = NOW() WHERE id = $1::uuid`,
      [id]
    );
  }

  /** Marca como erro (incrementa tentativas) */
  async function markError(id, attempts, message) {
    const t = (attempts || 0) + 1;
    await pool.query(
      `UPDATE send_queue SET attempts = $1, status = $2, error_message = $3 WHERE id = $4::uuid`,
      [t, t >= cfg.maxAttempts ? 'ERROR' : 'PENDING', message, id]
    );
  }

  /** Marca número inválido (erro definitivo) */
  async function markInvalid(id) {
    await pool.query(
      `UPDATE send_queue SET status = 'ERROR', attempts = $1, error_message = 'Número inválido' WHERE id = $2::uuid`,
      [cfg.maxAttempts, id]
    );
  }

  /** Busca template aleatório do modelo (rodízio anti-spam) */
  async function getTemplate(modelId) {
    const { rows } = await pool.query(
      `SELECT body FROM model_messages WHERE model_id = $1 AND is_active = true ORDER BY RANDOM() LIMIT 1`,
      [modelId]
    );
    return rows.length > 0 ? rows[0].body : null;
  }

  return { next, markSent, markError, markInvalid, getTemplate, getModelLabel };
}

module.exports = { createQueue, getModelLabel, MODEL_NAMES };
