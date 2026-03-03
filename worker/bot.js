require('dotenv').config();

const { Pool } = require('pg');
const { chromium } = require('playwright');
const path = require('path');

/**
 * CONFIGURAÇÃO DO BANCO LOCAL (WINDOWS)
 */
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'suasenha',
  port: process.env.DB_PORT || 5432,
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Mapa de nomes dos modelos
const MODEL_NAMES = {
  7: 'Resultados',
  14: 'Pesquisa',
};

function getModelLabel(modelId) {
  const name = MODEL_NAMES[modelId] || `Modelo ${modelId}`;
  return `${name} (M${String(modelId).padStart(2, '0')})`;
}

function estaNoHorarioDeTrabalho() {
  const agora = new Date();
  const dataSP = new Date(agora.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const horaSP = dataSP.getHours();
  const minutoSP = dataSP.getMinutes();
  const diaSemana = dataSP.getDay();

  const totalMinutos = (horaSP * 60) + minutoSP;
  const inicio = (5 * 60) + 40; 
  const fim = (19 * 60);       

  if (diaSemana === 0) return false; 
  return totalMinutos >= inicio && totalMinutos < fim;
}

function obterHorarioBrasilia() {
  return new Date().toLocaleTimeString("pt-BR", {timeZone: "America/Sao_Paulo"});
}

async function gravarLogCompleto(queueItem, status, detalhesErro = null) {
  const timestamp = obterHorarioBrasilia();
  const modelLabel = getModelLabel(queueItem.model_id);
  try {
    const details = {
      nome: queueItem.patient_name || 'N/A',
      telefone: queueItem.phone,
      protocolo: queueItem.protocol,
      modelo: modelLabel,
      horario_disparo: timestamp,
      status_final: status,
      erro: detalhesErro
    };

    await pool.query(
      'INSERT INTO send_logs (queue_id, event, details, created_at) VALUES ($1, $2, $3, NOW())',
      [queueItem.id, status === 'SUCESSO' ? 'SENT' : 'ERROR', JSON.stringify(details)]
    );
    
    if (status === 'SUCESSO') {
        console.log(`✅ [${timestamp}] Concluído: ${queueItem.patient_name} [${modelLabel}]`);
    } else {
        console.log(`❌ [${timestamp}] Erro em ${queueItem.patient_name} [${modelLabel}]: ${detalhesErro}`);
    }
  } catch (e) {
    console.error('⚠️ Falha ao gravar log local:', e.message);
  }
}

async function runBatch() {
  const sessionPath = path.join(__dirname, 'whatsapp-session');
  console.log('🚀 [Klett] Robô Vigia v3.10 – PostgreSQL Local Ativo');

  let browserContext, page;

  async function initBrowser() {
    try {
      console.log(`⏳ [${obterHorarioBrasilia()}] Conectando ao Chrome...`);
      browserContext = await chromium.launchPersistentContext(sessionPath, {
        headless: false,
        channel: 'chrome',
        executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        viewport: null, 
        args: [
            '--start-maximized', 
            '--no-sandbox',
            '--disable-infobars'
        ]
      });

      page = browserContext.pages()[0] || await browserContext.newPage();
      await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle', timeout: 90000 });
      console.log('✅ WhatsApp Conectado e Maximizado.');

      // --- SENSOR DE LIGAÇÕES ---
      await page.exposeFunction('enviarAvisoLigacao', async () => {
        try {
          const msgAviso = `Olá, nós do Laboratório Klett atendemos somente ligações convencionais no nosso número 3135571127. Caso não consiga resolver por mensagem pode nos ligar da sua linha de telefone.`;
          const inputBox = page.locator('footer div[contenteditable="true"]').last();
          if (await inputBox.isVisible()) {
            await inputBox.focus();
            await page.keyboard.type(msgAviso, { delay: 10 });
            await page.keyboard.press('Enter');
          }
        } catch (e) { console.log('⚠️ Erro Aviso Ligação:', e.message); }
      });

      await page.evaluate(() => {
        let travaAviso = false;
        const detectarChamada = () => {
          const t = document.title.toLowerCase();
          const temChamada = t.includes('chamada') || t.includes('📞');
          if (temChamada && !travaAviso) {
            window.enviarAvisoLigacao();
            travaAviso = true;
            setTimeout(() => { travaAviso = false; }, 30000); 
          }
        };
        setInterval(detectarChamada, 1000);
      });
    } catch (err) { 
        console.error('❌ Erro Inicialização:', err.message);
        process.exit(1); 
    }
  }

  await initBrowser();

  while (true) {
    try {
      if (!estaNoHorarioDeTrabalho()) {
        process.stdout.write(`\r🌙 [${obterHorarioBrasilia()}] Fora do horário comercial. Dormindo...`);
        await delay(60000); continue;
      }

      // MONITORAMENTO DE FILA LOCAL
      const resCountM07 = await pool.query("SELECT count(*) FROM send_queue WHERE status = 'PENDING' AND model_id = 7 AND attempts < 3");
      const resCountOutros = await pool.query("SELECT count(*) FROM send_queue WHERE status = 'PENDING' AND model_id != 7 AND attempts < 3");
      const totalM07 = resCountM07.rows[0].count;
      const totalOutros = resCountOutros.rows[0].count;

      // 1. PRIORIDADE MODELO 07
      let { rows } = await pool.query(
        "SELECT * FROM send_queue WHERE status = 'PENDING' AND model_id = 7 AND attempts < 3 ORDER BY sequence_num ASC LIMIT 1"
      );

      // 2. SE NÃO TIVER M07, BUSCA OS DEMAIS
      if (rows.length === 0) {
        const fallback = await pool.query(
          "SELECT * FROM send_queue WHERE (status = 'PENDING' OR status = 'ERROR') AND model_id != 7 AND attempts < 3 ORDER BY sequence_num ASC LIMIT 1"
        );
        rows = fallback.rows;
      }

      if (rows.length === 0) { 
        process.stdout.write(`\r🔍 [${obterHorarioBrasilia()}] Fila vazia...`);
        await delay(10000); continue; 
      }

      const queueItem = rows[0];
      const phone = queueItem.phone.toString().replace(/[^0-9]/g, '');
      const nomeExibicao = queueItem.patient_name || 'Cliente';
      const modelLabel = getModelLabel(queueItem.model_id);
      let sucessoNoEnvio = false;

      console.log(`\n${'─'.repeat(55)}`);
      console.log(`🟡 [${obterHorarioBrasilia()}] PROCESSANDO: ${nomeExibicao}`);
      console.log(`📊 FILA: Resultados (M07): ${totalM07} | Outros: ${totalOutros}`);
      console.log(`📨 ENVIANDO: ${modelLabel}`);

      try {
        await page.goto(`https://web.whatsapp.com/send?phone=${phone}`, { waitUntil: 'domcontentloaded', timeout: 40000 });

        const chatPronto = await page.waitForSelector('footer div[contenteditable="true"]', { timeout: 45000 }).catch(() => null);

        if (!chatPronto) {
          const okBtn = page.locator('button:has-text("OK"), [data-testid="popup-controls-ok"]').first();
          if (await okBtn.isVisible()) {
            await okBtn.click();
            await pool.query("UPDATE send_queue SET status = 'ERROR', attempts = 3 WHERE id = $1", [queueItem.id]);
            await gravarLogCompleto(queueItem, 'FALHA', 'Número Inválido');
          } else { throw new Error('Timeout: Chat não carregou.'); }
        } else {
          const msgRes = await pool.query("SELECT body FROM model_messages WHERE model_id = $1 AND is_active = true LIMIT 1", [queueItem.model_id]);

          if (msgRes.rows.length > 0) {
            const textoFinal = msgRes.rows[0].body
              .replace(/\[\[NOME\]\]/g, `*${nomeExibicao}*`)
              .replace(/\[\[PROTOCOLO\]\]/g, `*${queueItem.protocol}*`)
              .replace(/\[\[URL\]\]/g, queueItem.result_link || '')
              .replace(/\[\[UNIDADE\]\]/g, queueItem.variables?.UNIDADE || '');

            const linhas = textoFinal.split('\n');
            const inputBox = page.locator('footer div[contenteditable="true"]').last();
            await inputBox.focus();
            
            await page.keyboard.type(linhas[0], { delay: 25 });
            await page.keyboard.press('Enter');
            await delay(1200);

            if (linhas.length > 1) {
              const corpo = linhas.slice(1);
              for (let i = 0; i < corpo.length; i++) {
                await page.keyboard.type(corpo[i], { delay: 20 });
                if (i < corpo.length - 1) {
                  await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
                }
              }
              await page.keyboard.press('Enter');
            }

            await pool.query("UPDATE send_queue SET status = 'SENT', sent_at = NOW() WHERE id = $1", [queueItem.id]);
            await gravarLogCompleto(queueItem, 'SUCESSO');
            sucessoNoEnvio = true;
          }
        }
      } catch (e) {
        console.error(`❌ Erro em ${nomeExibicao} [${modelLabel}]: ${e.message}`);
        await pool.query(
          "UPDATE send_queue SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 3 THEN 'ERROR'::send_status ELSE 'PENDING'::send_status END WHERE id = $1",
          [queueItem.id]
        );
        await gravarLogCompleto(queueItem, 'FALHA', e.message);
      }

      if (sucessoNoEnvio) {
        await delay(Math.floor(Math.random() * 5000) + 30000);
      } else {
        await delay(2000);
      }

    } catch (err) {
      console.error('💥 Erro Crítico:', err.message);
      await delay(10000);
    }
  }
}

runBatch().catch(console.error);
