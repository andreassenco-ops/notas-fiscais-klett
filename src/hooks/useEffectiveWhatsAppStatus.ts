import { useEffect, useMemo, useRef } from "react";
import type { WhatsAppStatus } from "@/hooks/useWhatsAppSession";
import type { WorkerWhatsAppStatusResponse } from "@/hooks/useWhatsAppWorkerStatus";

/**
 * Deriva um status único a partir do retorno do worker.
 * Regra: QR_REQUIRED tem prioridade; caso contrário, o que vale é a conexão real.
 */
export function deriveStatusFromWorker(
  worker?: WorkerWhatsAppStatusResponse
): WhatsAppStatus | null {
  if (!worker?.success) return null;

  if (worker.dbStatus === "QR_REQUIRED") return "QR_REQUIRED";
  if (worker.realConnection?.connected) return "CONNECTED";
  return "DISCONNECTED";
}

/**
 * Calcula o status efetivo do WhatsApp evitando flicker:
 * - Usa o worker como fonte principal quando disponível
 * - Mantém o último status válido do worker como fallback (last known good)
 * - Se ainda não houver worker válido, usa o status do DB
 */
export function useEffectiveWhatsAppStatus(args: {
  sessionStatus?: WhatsAppStatus | null;
  workerStatus?: WorkerWhatsAppStatusResponse;
}) {
  const lastGoodWorkerStatusRef = useRef<WhatsAppStatus | null>(null);

  const derivedFromWorker = useMemo(
    () => deriveStatusFromWorker(args.workerStatus),
    [args.workerStatus]
  );

  useEffect(() => {
    if (derivedFromWorker) lastGoodWorkerStatusRef.current = derivedFromWorker;
  }, [derivedFromWorker]);

  return (
    derivedFromWorker ??
    lastGoodWorkerStatusRef.current ??
    args.sessionStatus ??
    "DISCONNECTED"
  );
}
