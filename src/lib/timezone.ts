/**
 * Utilitários de timezone para o projeto
 * Todas as datas são exibidas em horário de São Paulo
 */

import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

export const TIMEZONE = "America/Sao_Paulo";

/**
 * Converte uma data UTC para o horário de São Paulo
 */
export function toSaoPaulo(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(dateObj, TIMEZONE);
}

/**
 * Formata uma data UTC para exibição em São Paulo
 * @param date - Data em UTC (string ISO ou Date)
 * @param formatStr - Formato de saída (padrão: "dd/MM/yyyy HH:mm")
 */
export function formatInSaoPaulo(
  date: Date | string | null | undefined,
  formatStr: string = "dd/MM/yyyy HH:mm"
): string {
  if (!date) return "—";
  const spDate = toSaoPaulo(date);
  return format(spDate, formatStr, { locale: ptBR });
}

/**
 * Retorna "há X minutos" em horário de São Paulo
 */
export function formatDistanceInSaoPaulo(
  date: Date | string | null | undefined
): string {
  if (!date) return "—";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(dateObj, {
    addSuffix: true,
    locale: ptBR,
  });
}

/**
 * Formata hora curta (HH:mm) em São Paulo
 */
export function formatTimeInSaoPaulo(date: Date | string | null | undefined): string {
  return formatInSaoPaulo(date, "HH:mm");
}

/**
 * Formata data curta (dd/MM) em São Paulo
 */
export function formatDateShortInSaoPaulo(date: Date | string | null | undefined): string {
  return formatInSaoPaulo(date, "dd/MM");
}

/**
 * Formata data e hora completa em São Paulo
 */
export function formatDateTimeInSaoPaulo(date: Date | string | null | undefined): string {
  return formatInSaoPaulo(date, "dd/MM/yyyy 'às' HH:mm");
}
