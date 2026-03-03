/**
 * Backup e restauração da sessão WhatsApp via Supabase Storage
 * v3.0: Adaptado para Baileys (pasta auth_info)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import * as unzipper from 'unzipper';
import { logEvent } from './supabase';

// Diretório de autenticação Baileys
function getAuthDir(): string {
  const customPath = process.env.DATA_PATH;
  if (customPath) {
    return `${customPath}/auth_info`;
  }
  return './auth_info';
}

const AUTH_DIR = getAuthDir();
const BACKUP_BUCKET = 'whatsapp-session';
const BACKUP_FILENAME = 'session-backup-baileys.zip';

// Usar service role key para acessar o storage
function getStorageClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada - backup desabilitado');
    return null;
  }
  return createClient(config.supabase.url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Compacta a pasta de sessão em um arquivo ZIP
 */
async function zipSessionFolder(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.directory(AUTH_DIR, false);
    archive.finalize();
  });
}

/**
 * Faz backup da sessão para o Supabase Storage
 */
export async function backupSession(): Promise<boolean> {
  try {
    const client = getStorageClient();
    if (!client) return false;

    // Verificar se existe a pasta de sessão
    if (!fs.existsSync(AUTH_DIR)) {
      console.log('📁 Pasta de sessão não existe, nada a fazer backup');
      return false;
    }

    // Verificar se há arquivos de credenciais
    const files = fs.readdirSync(AUTH_DIR);
    if (files.length === 0) {
      console.log('📁 Pasta de sessão vazia, nada a fazer backup');
      return false;
    }

    console.log('📦 Compactando sessão Baileys...');
    const zipBuffer = await zipSessionFolder();

    console.log(`📤 Enviando backup (${(zipBuffer.length / 1024).toFixed(2)} KB)...`);

    // Remover backup antigo se existir
    await client.storage.from(BACKUP_BUCKET).remove([BACKUP_FILENAME]);

    // Upload do novo backup
    const { error } = await client.storage
      .from(BACKUP_BUCKET)
      .upload(BACKUP_FILENAME, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      });

    if (error) {
      console.error('❌ Erro ao fazer backup:', error.message);
      return false;
    }

    console.log('✅ Backup da sessão Baileys realizado com sucesso');
    await logEvent('SESSION_BACKUP_SUCCESS', undefined, { engine: 'baileys' });
    return true;
  } catch (error) {
    console.error('❌ Erro ao fazer backup da sessão:', error);
    return false;
  }
}

/**
 * Valida se a sessão restaurada parece válida
 */
function validateRestoredSession(): { valid: boolean; reason?: string } {
  if (!fs.existsSync(AUTH_DIR)) {
    return { valid: false, reason: 'auth_dir_not_found' };
  }
  
  const files = fs.readdirSync(AUTH_DIR);
  
  // Baileys usa arquivos como creds.json, app-state-sync-key-*.json, etc
  const hasCredentials = files.some(f => f === 'creds.json');
  const hasKeys = files.some(f => f.includes('app-state') || f.includes('pre-key'));
  
  if (hasCredentials && hasKeys) {
    return { valid: true };
  }
  
  return { 
    valid: false, 
    reason: `missing_files: creds=${hasCredentials}, keys=${hasKeys}, total=${files.length}` 
  };
}

/**
 * Restaura a sessão do Supabase Storage
 */
export async function restoreSession(): Promise<boolean> {
  try {
    const client = getStorageClient();
    if (!client) return false;

    console.log('🔍 Verificando backup de sessão Baileys...');

    // Baixar o backup
    const { data, error } = await client.storage
      .from(BACKUP_BUCKET)
      .download(BACKUP_FILENAME);

    if (error) {
      if (error.message?.includes('not found') || error.message?.includes('Object not found')) {
        console.log('📭 Nenhum backup Baileys encontrado - primeira execução');
        return false;
      }
      console.error('❌ Erro ao baixar backup:', error.message);
      return false;
    }

    if (!data) {
      console.log('📭 Backup vazio');
      return false;
    }

    console.log(`📥 Restaurando sessão Baileys do backup (${(data.size / 1024).toFixed(2)} KB)...`);

    // Criar diretório se não existir
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    // Extrair o ZIP
    const buffer = Buffer.from(await data.arrayBuffer());
    await new Promise<void>((resolve, reject) => {
      const stream = require('stream');
      const readable = new stream.Readable();
      readable.push(buffer);
      readable.push(null);

      readable
        .pipe(unzipper.Extract({ path: AUTH_DIR }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Validar a sessão restaurada
    const validation = validateRestoredSession();
    
    if (!validation.valid) {
      console.warn(`⚠️ Sessão restaurada parece inválida: ${validation.reason}`);
      await logEvent('SESSION_RESTORE_INVALID', undefined, { 
        reason: validation.reason,
        engine: 'baileys' 
      });
      
      // Limpar sessão inválida para forçar novo QR
      console.log('🧹 Removendo sessão inválida para forçar novo QR...');
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch {
        // ignore
      }
      
      return false;
    }

    console.log('✅ Sessão Baileys restaurada e validada com sucesso');
    await logEvent('SESSION_RESTORE_SUCCESS', undefined, { 
      validated: true,
      engine: 'baileys'
    });
    return true;
  } catch (error) {
    console.error('❌ Erro ao restaurar sessão:', error);
    await logEvent('SESSION_RESTORE_ERROR', undefined, { 
      error: error instanceof Error ? error.message : String(error),
      engine: 'baileys'
    });
    return false;
  }
}

/**
 * Remove o backup da sessão
 */
export async function deleteBackup(): Promise<boolean> {
  try {
    const client = getStorageClient();
    if (!client) return false;

    // Remover ambos os backups (novo e antigo)
    await client.storage.from(BACKUP_BUCKET).remove([BACKUP_FILENAME, 'session-backup.zip']);

    console.log('🗑️ Backup removido');
    return true;
  } catch (error) {
    console.error('❌ Erro ao remover backup:', error);
    return false;
  }
}
