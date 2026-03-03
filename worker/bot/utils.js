/**
 * Utilitários do Bot
 */

/** Retorna horário de Brasília formatado */
function horaBrasilia() {
  return new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Verifica se está no horário de trabalho (SP) */
function dentroDoHorario(workStart, workEnd) {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  if (sp.getDay() === 0) return false; // Domingo

  const min = sp.getHours() * 60 + sp.getMinutes();
  const inicio = workStart.hour * 60 + workStart.minute;
  const fim = workEnd.hour * 60 + workEnd.minute;
  return min >= inicio && min < fim;
}

/** Delay assíncrono */
const delay = ms => new Promise(r => setTimeout(r, ms));

/** Delay aleatório entre min e max */
const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min)) + min);

module.exports = { horaBrasilia, dentroDoHorario, delay, randomDelay };
