/**
 * API Client for local worker backend
 * 
 * Replaces Supabase SDK calls with direct HTTP calls to the worker API.
 * The worker URL is configurable via localStorage or falls back to
 * the Supabase Edge Function proxy path.
 */

const WORKER_URL_KEY = 'klett_worker_url';
const NGROK_URL = 'https://absorptive-piebaldly-cordell.ngrok-free.dev';

// Limpar URLs antigas de Cloudflare que ficaram no localStorage
if (typeof window !== 'undefined') {
  const old = localStorage.getItem(WORKER_URL_KEY);
  if (old && old.includes('trycloudflare.com')) {
    localStorage.removeItem(WORKER_URL_KEY);
  }
}

/**
 * Get the configured worker API URL.
 * Priority: localStorage > ngrok static domain
 */
export function getWorkerUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(WORKER_URL_KEY);
    if (stored) return stored.replace(/\/+$/, '');
  }
  return NGROK_URL;
}

/**
 * Set the worker API URL in localStorage
 */
export function setWorkerUrl(url: string): void {
  localStorage.setItem(WORKER_URL_KEY, url.replace(/\/+$/, ''));
}

/**
 * Check if a worker URL is configured
 */
export function isWorkerConfigured(): boolean {
  return !!getWorkerUrl();
}

/**
 * Generic fetch wrapper for the worker API
 */
async function workerFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getWorkerUrl();
  if (!baseUrl) {
    throw new Error('Worker URL não configurado. Vá em Configurações para definir.');
  }

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
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
};
