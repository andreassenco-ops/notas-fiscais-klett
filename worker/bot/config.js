/**
 * Configuração do Bot Playwright - Klett WhatsApp Sender
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  // PostgreSQL local (usado pelo pool no index.js, não aqui)
  chromePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  sessionPath: require('path').join(__dirname, '..', 'whatsapp-session'),

  // Horário de trabalho (São Paulo)
  workStart: { hour: 5, minute: 40 },
  workEnd: { hour: 19, minute: 0 },

  // Delays
  typingDelay: 22,        // ms por caractere
  afterSendMin: 30000,    // delay mínimo após envio (ms)
  afterSendMax: 35000,    // delay máximo após envio
  emptyQueueDelay: 10000, // delay quando fila vazia
  offHoursDelay: 600000,  // delay fora do horário (10min)
  errorDelay: 10000,

  // Limites
  maxAttempts: 3,
  chatTimeout: 45000,     // timeout para carregar chat
  navTimeout: 40000,      // timeout para navegação
};
