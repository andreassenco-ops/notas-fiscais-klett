/**
 * Cliente Supabase para o Worker
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabase.url, config.supabase.apiKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

// Tipos
export interface Settings {
  id: string;
  send_window_start: string;
  send_window_end: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
  import_interval_minutes: number;
  is_sending_enabled: boolean;
  last_import_at: string | null;
  updated_at: string;
}

export interface Template {
  id: number;
  name: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

export interface SendQueueItem {
  id: string;
  protocol: string;
  cpf: string;
  patient_name: string;
  phone: string;
  result_link: string;
  sequence_num: number;
  template_id: number | null;
  model_id: number | null;
  variables: Record<string, string>;
  status: 'PENDING' | 'SENT' | 'ERROR' | 'SKIPPED';
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface WhatsAppSession {
  id: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'QR_REQUIRED';
  qr_code: string | null;
  last_seen_at: string | null;
  session_data: Record<string, unknown> | null;
  updated_at: string;
}

// Funções auxiliares
export async function getSettings(): Promise<Settings | null> {
  const { data, error } = await getSupabase()
    .from('settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar settings:', error);
    return null;
  }
  return data as Settings | null;
}

export async function getActiveTemplate(templateId: number | null): Promise<Template | null> {
  const { data, error } = await getSupabase()
    .from('templates')
    .select('*')
    .eq('id', templateId || 1)
    .eq('is_active', true)
    .single();

  if (error) {
    // Fallback para template 1
    const { data: fallback } = await getSupabase()
      .from('templates')
      .select('*')
      .eq('id', 1)
      .single();
    return fallback as Template | null;
  }
  return data as Template;
}

export async function getWhatsAppSession(): Promise<WhatsAppSession | null> {
  const { data, error } = await getSupabase()
    .from('whatsapp_session')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar sessão WhatsApp:', error);
    return null;
  }
  return data as WhatsAppSession | null;
}

export async function updateWhatsAppSession(
  updates: Partial<WhatsAppSession>
): Promise<void> {
  const session = await getWhatsAppSession();
  if (!session) return;

  const { error } = await getSupabase()
    .from('whatsapp_session')
    .update(updates)
    .eq('id', session.id);

  if (error) {
    console.error('Erro ao atualizar sessão:', error);
  }
}

export async function logEvent(
  event: string,
  queueId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const { error } = await getSupabase().from('send_logs').insert({
    event,
    queue_id: queueId || null,
    details: details || null,
  });

  if (error) {
    console.error('Erro ao registrar log:', error);
  }
}

export async function getNextPendingItem(testOnly: boolean = false): Promise<SendQueueItem | null> {
  let query = getSupabase()
    .from('send_queue')
    .select('*')
    .eq('status', 'PENDING')
    .order('sequence_num', { ascending: true })
    .limit(1);

  // Se testOnly, buscar apenas itens de teste (protocolo começa com "TEST-")
  if (testOnly) {
    query = query.like('protocol', 'TEST-%');
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Erro ao buscar próximo item:', error);
    return null;
  }
  return data as SendQueueItem | null;
}

export async function markAsSent(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('send_queue')
    .update({
      status: 'SENT',
      sent_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Erro ao marcar como enviado:', error);
    throw error;
  }
}

export async function markAsError(
  id: string,
  errorMessage: string
): Promise<void> {
  const { data: current } = await getSupabase()
    .from('send_queue')
    .select('attempts')
    .eq('id', id)
    .single();

  const { error } = await getSupabase()
    .from('send_queue')
    .update({
      status: 'ERROR',
      error_message: errorMessage,
      attempts: (current?.attempts || 0) + 1,
    })
    .eq('id', id);

  if (error) {
    console.error('Erro ao marcar como erro:', error);
    throw error;
  }
}

export async function getNextSequenceNum(): Promise<number> {
  const { data } = await getSupabase()
    .from('send_queue')
    .select('sequence_num')
    .order('sequence_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.sequence_num || 0) + 1;
}

export async function upsertQueueItem(item: {
  protocol: string;
  cpf: string;
  patient_name: string;
  phone: string;
  result_link: string;
}): Promise<{ inserted: boolean }> {
  // Verificar se já existe
  const { data: existing } = await getSupabase()
    .from('send_queue')
    .select('id')
    .eq('protocol', item.protocol)
    .eq('cpf', item.cpf)
    .maybeSingle();

  if (existing) {
    return { inserted: false };
  }

  // Inserir novo
  const sequenceNum = await getNextSequenceNum();

  const { error } = await getSupabase().from('send_queue').insert({
    ...item,
    sequence_num: sequenceNum,
    status: 'PENDING',
  });

  if (error) {
    if (error.code === '23505') {
      // Unique violation - já existe
      return { inserted: false };
    }
    console.error('Erro ao inserir na fila:', error);
    throw error;
  }

  return { inserted: true };
}

export async function updateLastImportAt(): Promise<void> {
  const settings = await getSettings();
  if (!settings) return;

  const { error } = await getSupabase()
    .from('settings')
    .update({ last_import_at: new Date().toISOString() })
    .eq('id', settings.id);

  if (error) {
    console.error('Erro ao atualizar last_import_at:', error);
  }
}

// ============================================
// Distributed Lock Functions for WhatsApp
// ============================================

/**
 * Acquire a distributed lock for WhatsApp initialization
 * @param holder Unique identifier for this worker instance
 * @param durationSeconds Lock duration in seconds (default 300 = 5 min)
 * @returns true if lock was acquired, false otherwise
 */
export async function acquireWhatsAppLock(holder: string, durationSeconds: number = 300): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .rpc('acquire_whatsapp_lock', { 
        p_holder: holder, 
        p_duration_seconds: durationSeconds 
      });
    
    if (error) {
      console.error('Erro ao adquirir lock:', error);
      return false;
    }
    
    return data === true;
  } catch (err) {
    console.error('Exceção ao adquirir lock:', err);
    return false;
  }
}

/**
 * Release the distributed lock
 * @param holder Unique identifier for this worker instance
 */
export async function releaseWhatsAppLock(holder: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .rpc('release_whatsapp_lock', { p_holder: holder });
    
    if (error) {
      console.error('Erro ao liberar lock:', error);
      return false;
    }
    
    return data === true;
  } catch (err) {
    console.error('Exceção ao liberar lock:', err);
    return false;
  }
}

/**
 * Renew the distributed lock (extend expiration)
 * @param holder Unique identifier for this worker instance
 * @param durationSeconds New duration in seconds
 */
export async function renewWhatsAppLock(holder: string, durationSeconds: number = 300): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .rpc('renew_whatsapp_lock', { 
        p_holder: holder, 
        p_duration_seconds: durationSeconds 
      });
    
    if (error) {
      console.error('Erro ao renovar lock:', error);
      return false;
    }
    
    return data === true;
  } catch (err) {
    console.error('Exceção ao renovar lock:', err);
    return false;
  }
}

/**
 * Get current lock status
 */
export async function getWhatsAppLockStatus(): Promise<{
  lockHolder: string | null;
  lockAcquiredAt: string | null;
  lockExpiresAt: string | null;
  isLocked: boolean;
} | null> {
  try {
    const { data, error } = await getSupabase()
      .from('whatsapp_session')
      .select('lock_holder, lock_acquired_at, lock_expires_at')
      .limit(1)
      .maybeSingle();
    
    if (error || !data) return null;
    
    const now = new Date();
    const expiresAt = data.lock_expires_at ? new Date(data.lock_expires_at) : null;
    const isLocked = data.lock_holder !== null && expiresAt !== null && expiresAt > now;
    
    return {
      lockHolder: data.lock_holder,
      lockAcquiredAt: data.lock_acquired_at,
      lockExpiresAt: data.lock_expires_at,
      isLocked,
    };
  } catch (err) {
    console.error('Erro ao verificar status do lock:', err);
    return null;
  }
}
