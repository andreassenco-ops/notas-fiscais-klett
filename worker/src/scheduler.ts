/**
 * Agendador de tarefas do Worker
 * v4: Sem WhatsApp/Baileys - o bot.js cuida dos envios via Playwright
 */

import { runModelQueries } from './model-executor';

let modelQueryInterval: NodeJS.Timeout | null = null;

/**
 * Executa as queries de todos os modelos ativos
 */
async function executeModelQueries(): Promise<void> {
  try {
    console.log('🔄 Executando queries dos modelos...');
    await runModelQueries();
  } catch (error) {
    console.error('❌ Erro ao executar queries dos modelos:', error);
  }
}

/**
 * Inicia todos os agendamentos
 */
export async function startScheduler(): Promise<void> {
  console.log('📅 Iniciando agendador de tarefas...');

  // Queries dos modelos a cada 1 minuto (verifica internamente se é hora de cada modelo)
  modelQueryInterval = setInterval(executeModelQueries, 60 * 1000);
  console.log(`✅ Verificação de modelos agendada a cada 1 minuto`);

  // Executar queries dos modelos inicialmente
  console.log('🔄 Executando queries dos modelos inicialmente...');
  await executeModelQueries();
}

/**
 * Para todos os agendamentos
 */
export function stopScheduler(): void {
  if (modelQueryInterval) {
    clearInterval(modelQueryInterval);
    modelQueryInterval = null;
  }

  console.log('🛑 Agendador parado');
}
