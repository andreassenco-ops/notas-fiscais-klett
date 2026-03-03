/**
 * REST API routes backed by local PostgreSQL
 * Replaces Supabase SDK calls from the frontend
 */

import http from 'http';
import { Pool } from 'pg';

let pgPool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'klett',
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432'),
    });
    console.log('✅ PG Pool local criado');
  }
  return pgPool;
}

// ─── Helpers ───

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

// ─── Queue Stats ───

export async function handleQueueStats(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  // Use São Paulo timezone for "today" boundary
  const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  spNow.setHours(0, 0, 0, 0);
  const todayISO = spNow.toISOString();

  const [pending, sentToday, errorsToday, createdToday, sentResultsToday, sentSurveysToday] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE status = 'PENDING'`),
    pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE status = 'SENT' AND sent_at >= $1`, [todayISO]),
    pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE status = 'ERROR' AND updated_at >= $1`, [todayISO]),
    pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE created_at >= $1`, [todayISO]),
    pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE status = 'SENT' AND sent_at >= $1 AND model_id = 7`, [todayISO]),
    pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE status = 'SENT' AND sent_at >= $1 AND model_id = 14`, [todayISO]),
  ]);

  jsonResponse(res, {
    pending: parseInt(pending.rows[0].c),
    sentToday: parseInt(sentToday.rows[0].c),
    errorsToday: parseInt(errorsToday.rows[0].c),
    createdToday: parseInt(createdToday.rows[0].c),
    sentResultsToday: parseInt(sentResultsToday.rows[0].c),
    sentSurveysToday: parseInt(sentSurveysToday.rows[0].c),
  });
}

// ─── Send Queue (paginated, with model name join) ───

export async function handleSendQueue(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const status = url.searchParams.get('status') || null;
  const search = url.searchParams.get('search') || null;
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '50');
  const offset = (page - 1) * pageSize;

  const pool = getPgPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`sq.status = $${paramIdx++}`);
    params.push(status);
  }
  if (search) {
    conditions.push(`(sq.protocol ILIKE $${paramIdx} OR sq.cpf ILIKE $${paramIdx} OR sq.patient_name ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) AS c FROM send_queue sq ${where}`;
  const dataQuery = `
    SELECT sq.*, m.name AS model_name
    FROM send_queue sq
    LEFT JOIN models m ON m.id = sq.model_id
    ${where}
    ORDER BY sq.sequence_num DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  params.push(pageSize, offset);

  const [countRes, dataRes] = await Promise.all([
    pool.query(countQuery, params.slice(0, conditions.length === 0 ? 0 : (status && search ? 2 : 1))),
    pool.query(dataQuery, params),
  ]);

  // Fix: count query needs same params as data query (minus limit/offset)
  const countParams = params.slice(0, params.length - 2);
  const countResult = await pool.query(countQuery, countParams);
  const totalCount = parseInt(countResult.rows[0].c);

  jsonResponse(res, {
    items: dataRes.rows,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    currentPage: page,
  });
}

// ─── Settings ───

export async function handleGetSettings(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT * FROM settings LIMIT 1`);
  jsonResponse(res, rows[0] || null);
}

export async function handleUpdateSettings(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const pool = getPgPool();

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(body)) {
    if (key === 'id') continue;
    setClauses.push(`${key} = $${idx++}`);
    values.push(value);
  }

  if (setClauses.length === 0) {
    jsonResponse(res, { success: false, error: 'No fields to update' }, 400);
    return;
  }

  setClauses.push(`updated_at = NOW()`);

  const { rows } = await pool.query(
    `UPDATE settings SET ${setClauses.join(', ')} RETURNING *`,
    values
  );

  jsonResponse(res, { success: true, data: rows[0] });
}

// ─── Models ───

export async function handleGetModels(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT * FROM models ORDER BY id ASC`);
  jsonResponse(res, rows);
}

export async function handleGetModel(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const id = url.searchParams.get('id');
  if (!id) { jsonResponse(res, { error: 'id required' }, 400); return; }

  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT * FROM models WHERE id = $1`, [id]);
  jsonResponse(res, rows[0] || null);
}

export async function handleUpdateModel(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { id, ...updates } = body;
  if (!id) { jsonResponse(res, { error: 'id required' }, 400); return; }

  const pool = getPgPool();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = $${idx++}`);
    values.push(value);
  }
  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE models SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  jsonResponse(res, { success: true, data: rows[0] });
}

// ─── Model Messages ───

export async function handleGetModelMessages(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const modelId = url.searchParams.get('model_id');
  if (!modelId) { jsonResponse(res, { error: 'model_id required' }, 400); return; }

  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM model_messages WHERE model_id = $1 ORDER BY message_index ASC`,
    [modelId]
  );
  jsonResponse(res, rows);
}

export async function handleUpsertModelMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { model_id, message_index, body: msgBody, is_active } = body;

  const pool = getPgPool();
  const { rows } = await pool.query(`
    INSERT INTO model_messages (model_id, message_index, body, is_active)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (model_id, message_index) DO UPDATE SET body = $3, is_active = $4, updated_at = NOW()
    RETURNING *
  `, [model_id, message_index, msgBody, is_active ?? true]);

  jsonResponse(res, { success: true, data: rows[0] });
}

export async function handleUpdateModelMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { id, ...updates } = body;
  if (!id) { jsonResponse(res, { error: 'id required' }, 400); return; }

  const pool = getPgPool();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = $${idx++}`);
    values.push(value);
  }
  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE model_messages SET ${setClauses.join(', ')} WHERE id = $${idx}::uuid RETURNING *`,
    values
  );
  jsonResponse(res, { success: true, data: rows[0] });
}

export async function handleDeleteModelMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { id } = body;
  if (!id) { jsonResponse(res, { error: 'id required' }, 400); return; }

  const pool = getPgPool();
  await pool.query(`DELETE FROM model_messages WHERE id = $1::uuid`, [id]);
  jsonResponse(res, { success: true });
}

// ─── Monthly Stats ───

export async function handleMonthlyStats(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 3, 0, 0));

  const { rows } = await pool.query(
    `SELECT COUNT(*) AS c FROM send_queue WHERE status = 'SENT' AND sent_at >= $1`,
    [startOfMonth.toISOString()]
  );

  jsonResponse(res, { sentThisMonth: parseInt(rows[0].c) });
}

// ─── WhatsApp Session ───

export async function handleGetWhatsAppSession(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM whatsapp_session ORDER BY updated_at DESC LIMIT 1`
  );
  jsonResponse(res, rows[0] || null);
}

// ─── Last Sync Status ───

export async function handleLastSyncStatus(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const { rows } = await pool.query(`
    SELECT details, created_at FROM send_logs
    WHERE event = 'MODEL_QUERY_EXECUTED'
    ORDER BY created_at DESC LIMIT 1
  `);

  if (!rows[0]) {
    jsonResponse(res, { lastQueryAt: null, modelName: null, total: 0, inserted: 0, skipped: 0, errors: 0 });
    return;
  }

  const details = rows[0].details as Record<string, unknown> | null;
  const isModel7 = details?.model_id === 7;

  jsonResponse(res, {
    lastQueryAt: rows[0].created_at,
    modelName: isModel7 ? (details?.model_name ?? null) : null,
    total: isModel7 ? (details?.total ?? 0) : 0,
    inserted: isModel7 ? (details?.inserted ?? 0) : 0,
    skipped: isModel7 ? (details?.skipped ?? 0) : 0,
    errors: isModel7 ? (details?.errors ?? 0) : 0,
  });
}

// ─── Historical Sends ───

export async function handleHistoricalSends(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const search = url.searchParams.get('search') || null;
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '50');
  const statusFilter = url.searchParams.get('status') || 'all';

  const pool = getPgPool();

  // Queue items
  const statusList = statusFilter === 'all' ? ['SENT', 'ERROR'] : [statusFilter];
  const { rows: queueData } = await pool.query(`
    SELECT sq.id, sq.phone, sq.patient_name, sq.protocol, sq.cpf, sq.status,
      sq.sent_at, sq.error_message, m.name AS model_name
    FROM send_queue sq
    LEFT JOIN models m ON m.id = sq.model_id
    WHERE sq.status = ANY($1) AND sq.sent_at IS NOT NULL
    ORDER BY sq.sent_at DESC
  `, [statusList]);

  // Logs
  const logEvents = statusFilter === 'ERROR' ? ['SEND_ERROR'] : ['SENT', 'TEST_SENT'];
  const { rows: logsData } = await pool.query(`
    SELECT * FROM send_logs WHERE event = ANY($1) ORDER BY created_at DESC
  `, [logEvents]);

  // Process queue
  const queueIds = new Set(queueData.map((r: any) => r.id));
  const queueItems = queueData.map((item: any) => ({
    ...item,
    status: item.status === 'ERROR' ? 'ERROR' : 'SENT',
    source: 'queue',
  }));

  // Process logs (not already in queue)
  const logItems: any[] = [];
  for (const log of logsData) {
    if (log.queue_id && queueIds.has(log.queue_id)) continue;
    const details = log.details as Record<string, unknown> | null;
    if (!details) continue;
    const phone = (details.verified_number || details.phone) as string;
    if (!phone) continue;
    logItems.push({
      id: log.id,
      phone,
      patient_name: (details.patient_name as string) || 'N/A',
      protocol: (details.protocol as string) || 'N/A',
      cpf: (details.cpf as string) || 'N/A',
      status: log.event === 'SEND_ERROR' ? 'ERROR' : log.event,
      sent_at: log.created_at,
      model_name: (details.model_name as string) || undefined,
      source: 'log',
      verified_number: details.verified_number,
      message_id: details.message_id,
      error_message: details.error,
    });
  }

  let allItems = [...queueItems, ...logItems];
  allItems.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

  if (search) {
    const s = search.toLowerCase();
    allItems = allItems.filter((i: any) =>
      i.protocol.toLowerCase().includes(s) ||
      i.cpf.toLowerCase().includes(s) ||
      i.patient_name.toLowerCase().includes(s) ||
      i.phone.includes(search)
    );
  }

  const totalCount = allItems.length;
  const start = (page - 1) * pageSize;
  const items = allItems.slice(start, start + pageSize);

  jsonResponse(res, {
    items,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    currentPage: page,
  });
}

export async function handleHistoricalStats(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const { rows } = await pool.query(`
    SELECT id, event, details FROM send_logs WHERE event IN ('SENT', 'TEST_SENT')
  `);

  const uniquePhones = new Set<string>();
  let totalSent = 0, totalTest = 0;

  for (const log of rows) {
    const details = log.details as Record<string, unknown> | null;
    const phone = (details?.verified_number || details?.phone) as string | undefined;
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 11) uniquePhones.add(digits.slice(-11));
    }
    if (log.event === 'SENT') totalSent++;
    if (log.event === 'TEST_SENT') totalTest++;
  }

  jsonResponse(res, {
    totalMessages: rows.length,
    uniqueContacts: uniquePhones.size,
    sentMessages: totalSent,
    testMessages: totalTest,
  });
}

// ─── Sent Phones ───

export async function handleSentPhones(_req: http.IncomingMessage, res: http.ServerResponse) {
  const pool = getPgPool();
  const { rows } = await pool.query(`
    SELECT details FROM send_logs WHERE event IN ('SENT', 'TEST_SENT')
  `);

  const phones: string[] = [];
  for (const row of rows) {
    const details = row.details as Record<string, unknown> | null;
    const phone = (details?.verified_number || details?.phone) as string | undefined;
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 11) phones.push(digits.slice(-11));
    }
  }

  jsonResponse(res, [...new Set(phones)]);
}

// ─── Resend Message ───

export async function handleResendMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { id } = body;
  if (!id) { jsonResponse(res, { error: 'id required' }, 400); return; }

  const pool = getPgPool();

  const { rows: current } = await pool.query(
    `SELECT attempts FROM send_queue WHERE id = $1::uuid`, [id]
  );
  const newAttempts = (current[0]?.attempts ?? 0) + 1;

  await pool.query(`
    UPDATE send_queue SET status = 'PENDING', error_message = NULL, attempts = $1, updated_at = NOW()
    WHERE id = $2::uuid
  `, [newAttempts, id]);

  await pool.query(`
    INSERT INTO send_logs (queue_id, event, details)
    VALUES ($1::uuid, 'MANUAL_RESEND', $2)
  `, [id, JSON.stringify({ resent_at: new Date().toISOString(), attempt_number: newAttempts })]);

  jsonResponse(res, { success: true });
}

// ─── Generic Admin API (replaces admin-api Edge Function) ───

export async function handleAdminApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { action, table, data, id, filters } = body;

  const pool = getPgPool();
  const allowedTables = ['settings', 'models', 'model_messages', 'send_queue', 'whatsapp_session'];

  if (!allowedTables.includes(table)) {
    jsonResponse(res, { success: false, error: `Table ${table} not allowed` }, 400);
    return;
  }

  try {
    if (action === 'update') {
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const [key, value] of Object.entries(data || {})) {
        setClauses.push(`"${key}" = $${idx++}`);
        values.push(value);
      }
      if (setClauses.length === 0) {
        jsonResponse(res, { success: false, error: 'No fields' }, 400);
        return;
      }

      let whereClause = '';
      if (id) {
        whereClause = `WHERE id = $${idx}`;
        values.push(id);
      } else if (filters && Object.keys(filters).length > 0) {
        const filterClauses = Object.entries(filters).map(([k, v]) => {
          values.push(v);
          return `"${k}" = $${idx++}`;
        });
        whereClause = `WHERE ${filterClauses.join(' AND ')}`;
      }

      const { rows } = await pool.query(
        `UPDATE ${table} SET ${setClauses.join(', ')} ${whereClause} RETURNING *`,
        values
      );
      jsonResponse(res, { success: true, data: rows });

    } else if (action === 'insert') {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`);

      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      );
      jsonResponse(res, { success: true, data: rows });

    } else if (action === 'upsert') {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const updateSet = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');

      // For model_messages, conflict on (model_id, message_index)
      let conflictTarget = '(id)';
      if (table === 'model_messages') conflictTarget = '(model_id, message_index)';

      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders.join(', ')})
         ON CONFLICT ${conflictTarget} DO UPDATE SET ${updateSet}
         RETURNING *`,
        values
      );
      jsonResponse(res, { success: true, data: rows });

    } else if (action === 'delete') {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      jsonResponse(res, { success: true });

    } else {
      jsonResponse(res, { success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error(`[AdminAPI] Error:`, err);
    jsonResponse(res, { success: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
}

export async function closePgPool() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}
