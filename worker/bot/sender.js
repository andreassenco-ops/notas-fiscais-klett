/**
 * Motor de envio de mensagens via Playwright
 */
const { delay } = require('./utils');

function createSender(page, cfg) {

  /** Navega para o chat do número */
  async function openChat(phone) {
    // networkidle: garante que o WhatsApp baixou todos os scripts
    await page.goto(`https://web.whatsapp.com/send?phone=${phone}`, {
      waitUntil: 'networkidle',
      timeout: cfg.navTimeout,
    });

    // visible: true garante que o campo está realmente pronto para digitar
    let input = await page.waitForSelector(
      'footer div[contenteditable="true"]',
      { visible: true, timeout: cfg.chatTimeout }
    ).catch(() => null);

    if (!input) {
      // Verifica popup de número inválido ANTES de retry
      const okBtn = page.locator('button:has-text("OK"), [data-testid="popup-controls-ok"]').first();
      if (await okBtn.isVisible()) {
        await okBtn.click();
        return { ok: false, reason: 'INVALID_NUMBER' };
      }

      // Chat travou na "bolinha girando" — reload para limpar o estado
      console.log('🔄 Chat travado. Recarregando para tentar novamente...');
      await page.reload({ waitUntil: 'networkidle', timeout: cfg.navTimeout });

      input = await page.waitForSelector(
        'footer div[contenteditable="true"]',
        { visible: true, timeout: cfg.chatTimeout }
      ).catch(() => null);

      if (!input) {
        const okBtn2 = page.locator('button:has-text("OK"), [data-testid="popup-controls-ok"]').first();
        if (await okBtn2.isVisible()) {
          await okBtn2.click();
          return { ok: false, reason: 'INVALID_NUMBER' };
        }
        return { ok: false, reason: 'TIMEOUT' };
      }
    }

    return { ok: true };
  }

  /** Interpola variáveis no template */
  function interpolate(template, item) {
    return template
      .replace(/\[\[NOME\]\]/g, `*${item.variables?.NOME || item.patient_name || 'Cliente'}*`)
      .replace(/\[\[PROTOCOLO\]\]/g, `*${item.protocol}*`)
      .replace(/\[\[URL\]\]/g, item.result_link || '')
      .replace(/\[\[UNIDADE\]\]/g, item.variables?.UNIDADE || '')
      .replace(/\[\[CHAVE\]\]/g, item.variables?.CHAVE || '')
      .replace(/\[\[VALOR\]\]/g, item.variables?.VALOR || '');
  }

  /** Digita e envia a mensagem */
  async function typeAndSend(text) {
    const lines = text.split('\n');
    const inputBox = page.locator('footer div[contenteditable="true"]').last();
    await inputBox.focus();

    // Primeira linha + Enter (envia como mensagem separada se tiver mais)
    await page.keyboard.type(lines[0], { delay: cfg.typingDelay });

    if (lines.length === 1) {
      await page.keyboard.press('Enter');
      return;
    }

    await page.keyboard.press('Enter');
    await delay(1200);

    // Restante das linhas com Shift+Enter (mesma bolha)
    const rest = lines.slice(1);
    for (let i = 0; i < rest.length; i++) {
      await page.keyboard.type(rest[i], { delay: cfg.typingDelay - 2 });
      if (i < rest.length - 1) {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Shift');
      }
    }
    await page.keyboard.press('Enter');
  }

  return { openChat, interpolate, typeAndSend };
}

module.exports = { createSender };
