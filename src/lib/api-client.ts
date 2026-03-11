/**
 * API Client for Railway Worker backend
 * 
 * Auto-fetches WORKER_API_URL from backend (edge function secret).
 * No manual configuration needed.
 */

import { supabase } from "@/integrations/supabase/client";

let cachedWorkerUrl: string | null = null;
let fetchingPromise: Promise<string> | null = null;

/**
 * Get the worker API URL.
 * Auto-fetches from edge function (WORKER_API_URL secret) and caches in memory.
 */
async function resolveWorkerUrl(): Promise<string> {
  // Return cached value
  if (cachedWorkerUrl) return cachedWorkerUrl;

  // Check localStorage legacy fallback
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('klett_worker_url');
    if (stored) {
      cachedWorkerUrl = stored.replace(/\/+$/, '');
      return cachedWorkerUrl;
    }
  }

  // Deduplicate concurrent fetches
  if (fetchingPromise) return fetchingPromise;

  fetchingPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-worker-url');
      if (data?.url) {
        let url = String(data.url).replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        cachedWorkerUrl = url;
        return cachedWorkerUrl;
      }
    } catch {
      // ignore
    }

    throw new Error('Worker URL não disponível. Verifique o secret WORKER_API_URL no backend.');
  })();

  try {
    return await fetchingPromise;
  } finally {
    fetchingPromise = null;
  }
}

/**
 * Sync getter for places that need it (non-async contexts)
 */
export function getWorkerUrl(): string {
  return cachedWorkerUrl || '';
}

export function isWorkerConfigured(): boolean {
  return !!cachedWorkerUrl;
}

/**
 * Generic fetch wrapper for the worker API
 */
async function workerFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = await resolveWorkerUrl();

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ─── Queue ───

export const api = {
  // Queue stats
  getQueueStats: () => workerFetch<{
    pending: number;
    sentToday: number;
    errorsToday: number;
    createdToday: number;
    sentResultsToday: number;
    sentSurveysToday: number;
  }>('/api/pg/queue-stats'),

  // Send queue (paginated)
  getSendQueue: (params: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return workerFetch<{
      items: unknown[];
      totalCount: number;
      totalPages: number;
      currentPage: number;
    }>(`/api/pg/send-queue?${qs}`);
  },

  // Resend message
  resendMessage: (id: string) =>
    workerFetch('/api/pg/resend', { method: 'POST', body: JSON.stringify({ id }) }),

  // ─── Settings ───
  getSettings: () => workerFetch('/api/pg/settings'),
  updateSettings: (data: Record<string, unknown>) =>
    workerFetch('/api/pg/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Models ───
  getModels: () => workerFetch<unknown[]>('/api/pg/models'),
  getModel: (id: number) => workerFetch(`/api/pg/models/one?id=${id}`),
  updateModel: (id: number, updates: Record<string, unknown>) =>
    workerFetch('/api/pg/models', { method: 'PUT', body: JSON.stringify({ id, ...updates }) }),

  // ─── Model Messages ───
  getModelMessages: (modelId: number) =>
    workerFetch<unknown[]>(`/api/pg/model-messages?model_id=${modelId}`),
  upsertModelMessage: (data: Record<string, unknown>) =>
    workerFetch('/api/pg/model-messages', { method: 'POST', body: JSON.stringify(data) }),
  updateModelMessage: (id: string, data: Record<string, unknown>) =>
    workerFetch('/api/pg/model-messages', { method: 'PUT', body: JSON.stringify({ id, ...data }) }),
  deleteModelMessage: (id: string) =>
    workerFetch('/api/pg/model-messages', { method: 'DELETE', body: JSON.stringify({ id }) }),

  // ─── Stats ───
  getMonthlyStats: () => workerFetch<{ sentThisMonth: number }>('/api/pg/monthly-stats'),
  getLastSyncStatus: () => workerFetch('/api/pg/last-sync'),

  // ─── WhatsApp ───
  getWhatsAppSession: () => workerFetch('/api/pg/whatsapp-session'),
  getWhatsAppWorkerStatus: () => workerFetch('/api/whatsapp/status'),
  startWhatsApp: () => workerFetch('/api/whatsapp/start', { method: 'POST' }),
  stopWhatsApp: () => workerFetch('/api/whatsapp/stop', { method: 'POST' }),
  sendMessage: (phone: string, message: string) =>
    workerFetch('/api/whatsapp/send', { method: 'POST', body: JSON.stringify({ phone, message }) }),

  // ─── History ───
  getHistoricalSends: (params: {
    search?: string;
    page?: number;
    pageSize?: number;
    status?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.status) qs.set('status', params.status);
    return workerFetch(`/api/pg/historical-sends?${qs}`);
  },
  getHistoricalStats: () => workerFetch('/api/pg/historical-stats'),
  getSentPhones: () => workerFetch<string[]>('/api/pg/sent-phones'),

  // ─── Admin API (generic CRUD) ───
  adminApi: (params: {
    action: string;
    table: string;
    data?: Record<string, unknown>;
    id?: string | number;
    filters?: Record<string, unknown>;
  }) => workerFetch('/api/pg/admin', { method: 'POST', body: JSON.stringify(params) }),

  // ─── SQL Test Query (proxied to MSSQL) ───
  testSqlQuery: (sqlQuery: string, limit?: number) =>
    workerFetch('/api/test-query', {
      method: 'POST',
      body: JSON.stringify({ sql_query: sqlQuery, limit: limit || 10 }),
    }),

  // ─── NFS-e ───
  getNfseStatus: () => workerFetch<{ configured: boolean }>('/api/nfse/status'),

  enqueueNfseWhatsapp: (items: Array<{
    protocolo: string;
    pacienteNome: string;
    cpf: string;
    valor: number;
    chaveAcesso: string;
  }>) => workerFetch<{
    results: Array<{ protocolo: string; success: boolean; error?: string; phone?: string }>;
    enqueued: number;
    total: number;
  }>('/api/nfse/enqueue-whatsapp', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }),
  emitirNfse: (params: {
    protocolo: string;
    pacienteNome: string;
    cpf: string;
    valor: number;
    formaPagamento?: string;
    observacao?: string;
    ambiente?: 1 | 2;
  }) => workerFetch<{
    success: boolean;
    chNFSe?: string;
    chDPS?: string;
    error?: string;
    detalhes?: unknown;
  }>('/api/nfse/emitir', {
    method: 'POST',
    body: JSON.stringify(params),
  }),
  emitirNfseLote: (items: Array<{
    protocolo: string;
    pacienteNome: string;
    cpf: string;
    valor: number;
    formaPagamento?: string;
    dataAtendimento?: string;
  }>, ambiente?: 1 | 2) => workerFetch<{
    results: Array<{ protocolo: string; success: boolean; chNFSe?: string; nNFSe?: string; nDFSe?: string; nDPS?: string; pdfBase64?: string; xmlRetorno?: string; error?: string; jaEmitida?: boolean; dados?: { pacienteNome: string; cpf: string; valor: number; formaPagamento?: string } }>;
    total: number;
    emitidas: number;
    erros: number;
  }>('/api/nfse/emitir-lote', {
    method: 'POST',
    body: JSON.stringify({ items, ambiente }),
  }),
  fetchDanfse: (chave: string, ambiente: 1 | 2 = 1) => workerFetch<{
    success: boolean;
    pdfBase64?: string;
    error?: string;
  }>(`/api/nfse/danfse?chave=${encodeURIComponent(chave)}&ambiente=${ambiente}`),
};
