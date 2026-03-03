/**
 * Bot Klett WhatsApp Sender v4.1 - PostgreSQL Local
 * 
 * Uso: node bot/index.js
 */
const { Pool } = require('pg');
const { chromium } = require('playwright');
const cfg = require('./config');
const { horaBrasilia, dentroDoHorario, delay, randomDelay } = require('./utils');
const { createLogger } = require('./logger');
const { createQueue } = require('./queue');
const { createSender } = require('./sender');
const { setupCallSensor } = require('./call-sensor');

// PostgreSQL local em vez de Supabase Cloud
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'klett',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

const gravarLog = createLogger(pool);
const queue = createQueue(pool, cfg);

async function main() {
  console.log('🚀 [Klett] Bot v4.1 - PostgreSQL Local');

  // Testar conexão PG
  try {
    const { rows } = await pool.query(`SELECT COUNT(*) AS c FROM send_queue WHERE status = 'PENDING'`);
    console.log(`✅ PostgreSQL conectado. ${rows[0].c} pendentes na fila.`);
  } catch (e) {
    console.error('❌ Falha ao conectar ao PostgreSQL:', e.message);
    process.exit(1);
  }

  // --- Inicializar navegador ---
  let browserContext, page;

  async function initBrowser() {
    console.log(`⏳ [${horaBrasilia()}] Conectando ao Chrome...`);
    browserContext = await chromium.launchPersistentContext(cfg.sessionPath, {
      headless: false,
      channel: 'chrome',
      executablePath: cfg.chromePath,
      args: ['--start-maximized', '--no-default-browser-check'],
      viewport: null,
    });
    page = browserContext.pages()[0] || await browserContext.newPage();
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle', timeout: 90000 });
    console.log('✅ WhatsApp Conectado.');
    await setupCallSensor(page);
  }

  await initBrowser();

  // --- Loop principal ---
  while (true) {
    try {
      if (!dentroDoHorario(cfg.workStart, cfg.workEnd)) {
        console.log(`🌙 [${horaBrasilia()}] Fora do horário. Aguardando...`);
        await delay(cfg.offHoursDelay);
        continue;
      }

      const result = await queue.next();
      if (!result) {
        process.stdout.write(`\r🔍 [${horaBrasilia()}] Fila vazia...`);
        await delay(cfg.emptyQueueDelay);
        continue;
      }

      const { item, counts } = result;
      const phone = item.phone.replace(/[^0-9]/g, '');
      const nome = item.patient_name || 'Cliente';
      const modelLabel = queue.getModelLabel(item.model_id);

      console.log(`\n${'─'.repeat(55)}`);
      console.log(`🟡 [${horaBrasilia()}] PROCESSANDO: ${nome}`);
      console.log(`📊 FILA: Resultados (M07): ${counts.m7} | Outros: ${counts.others}`);
      console.log(`📨 ENVIANDO: ${modelLabel}`);

      const sender = createSender(page, cfg);
      let enviado = false;

      try {
        console.log(`📡 Navegando para: ${phone}...`);
        const chatResult = await sender.openChat(phone);

        if (!chatResult.ok) {
          if (chatResult.reason === 'INVALID_NUMBER') {
            console.log(`⚠️ Número inválido: ${phone}`);
            await queue.markInvalid(item.id);
            await gravarLog(item, 'FALHA', 'Número Inválido');
          } else {
            throw new Error('Timeout: O chat não carregou em 45 segundos.');
          }
        } else {
          const template = await queue.getTemplate(item.model_id);
          if (template) {
            console.log('✍️ Digitando mensagens...');
            const texto = sender.interpolate(template, item);
            await sender.typeAndSend(texto);
            await queue.markSent(item.id);
            await gravarLog(item, 'SUCESSO');
            console.log(`✅ [${horaBrasilia()}] Concluído: ${nome} [${modelLabel}]`);
            enviado = true;
          }
        }
      } catch (e) {
        console.error(`❌ Erro no processo: ${e.message}`);
        await queue.markError(item.id, item.attempts, e.message);
        await gravarLog(item, 'FALHA', e.message);
      }

      if (enviado) {
        const espera = Math.floor(Math.random() * (cfg.afterSendMax - cfg.afterSendMin)) + cfg.afterSendMin;
        console.log(`⏱️ Aguardando ${Math.round(espera / 1000)}s...`);
        await delay(espera);
      } else {
        await delay(2000);
      }

    } catch (err) {
      console.error('💥 Erro Crítico no Loop:', err.message);
      if (err.message.includes('closed')) await initBrowser();
      await delay(cfg.errorDelay);
    }
  }
}

main().catch(console.error);
