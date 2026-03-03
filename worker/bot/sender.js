/**
 * Motor de envio de mensagens via Playwright
 */
const { delay } = require('./utils');

function createSender(page, cfg) {

  /** Navega para o chat do número */
  async function openChat(phone) {
    await page.goto(`https://web.whatsapp.com/send?phone=${phone}`, {
      waitUntil: 'domcontentloaded',
      timeout: cfg.navTimeout,
    });

    const input = await page.waitForSelector(
      'footer div[contenteditable="true"]',
      { timeout: cfg.chatTimeout }
    ).catch(() => null);

    if (!input) {
      // Verifica popup de número inválido
      const okBtn = page.locator('button:has-text("OK"), [data-testid="popup-controls-ok"]').first();
      if (await okBtn.isVisible()) {
        await okBtn.click();
        return { ok: false, reason: 'INVALID_NUMBER' };
      }
      return { ok: false, reason: 'TIMEOUT' };
    }

    return { ok: true };
  }

  /** Interpola variáveis no template */
  function interpolate(template, item) {
    return template
      .replace(/\[\[NOME\]\]/g, `*${item.variables?.NOME || item.patient_name || 'Cliente'}*`)
      .replace(/\[\[PROTOCOLO\]\]/g, `*${item.protocol}*`)
      .replace(/\[\[URL\]\]/g, item.result_link || '')
      .replace(/\[\[UNIDADE\]\]/g, item.variables?.UNIDADE || '');
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
