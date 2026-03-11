/**
 * Limpa cache pesado da sessão do Chrome (mídia, Service Workers, GPU cache)
 * sem apagar os dados de login do WhatsApp.
 */
const fs = require('fs');
const path = require('path');

// Pastas seguras para deletar (não afetam a sessão autenticada)
const SAFE_TO_DELETE = [
  'Service Worker',
  'GPUCache',
  'Cache',
  'Code Cache',
  'DawnCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  'blob_storage',
  'Session Storage',
  'VideoDecodeStats',
  'optimization_guide_prediction_model_downloads',
];

function cleanSessionCache(sessionPath) {
  if (!fs.existsSync(sessionPath)) {
    console.log('📁 Pasta de sessão não encontrada, será criada na inicialização.');
    return { cleaned: 0, sizeMB: 0 };
  }

  let totalBytes = 0;
  let cleaned = 0;

  // Limpa na raiz e dentro de Default/
  const searchDirs = [sessionPath, path.join(sessionPath, 'Default')];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    for (const folder of SAFE_TO_DELETE) {
      const target = path.join(dir, folder);
      if (fs.existsSync(target)) {
        try {
          const size = getDirSize(target);
          fs.rmSync(target, { recursive: true, force: true });
          totalBytes += size;
          cleaned++;
        } catch (e) {
          // Ignora arquivos travados pelo SO
        }
      }
    }
  }

  const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
  if (cleaned > 0) {
    console.log(`🧹 Cache limpo: ${cleaned} pastas removidas (${sizeMB} MB liberados)`);
  } else {
    console.log('✨ Cache já está limpo.');
  }

  return { cleaned, sizeMB };
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(full);
      } else {
        try { size += fs.statSync(full).size; } catch (_) {}
      }
    }
  } catch (_) {}
  return size;
}

module.exports = { cleanSessionCache };
