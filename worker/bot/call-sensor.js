/**
 * Sensor de ligações - detecta chamadas recebidas e envia aviso automático
 */

async function setupCallSensor(page) {
  const AVISO = 'Olá, nós do Laboratório Klett atendemos somente ligações convencionais no nosso número 3135571127. Caso não consiga resolver por mensagem pode nos ligar da sua linha de telefone (Fora do Whatsapp). Agradecemos muito pelo contato.';

  await page.exposeFunction('enviarAvisoLigacao', async () => {
    try {
      const inputBox = page.locator('footer div[contenteditable="true"]').last();
      if (await inputBox.isVisible()) {
        await inputBox.focus();
        await page.keyboard.type(AVISO, { delay: 10 });
        await page.keyboard.press('Enter');
      }
    } catch (e) {
      console.log('⚠️ Erro ao avisar ligação:', e.message);
    }
  });

  await page.evaluate(() => {
    let trava = false;
    setInterval(() => {
      const t = document.title.toLowerCase();
      const corpo = document.body.innerText.toLowerCase();
      const temChamada = t.includes('chamada') || t.includes('📞') || corpo.includes('chamada de voz');
      if (temChamada && !trava) {
        window.enviarAvisoLigacao();
        trava = true;
        setTimeout(() => { trava = false; }, 30000);
      }
    }, 1000);
  });
}

module.exports = { setupCallSensor };
