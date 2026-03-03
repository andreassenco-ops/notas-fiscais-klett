import { AlertTriangle, WifiOff, Clock, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { WorkerWhatsAppStatusResponse } from "@/hooks/useWhatsAppWorkerStatus";

interface StatusAlertsProps {
  workerStatus?: WorkerWhatsAppStatusResponse;
  effectiveStatus: "CONNECTED" | "DISCONNECTED" | "QR_REQUIRED";
}

export function StatusAlerts({ workerStatus, effectiveStatus }: StatusAlertsProps) {
  const alerts: React.ReactNode[] = [];

  // Alerta: WhatsApp desconectado
  if (effectiveStatus === "DISCONNECTED") {
    alerts.push(
      <Alert key="disconnected" variant="destructive" className="border-destructive/50 bg-destructive/10">
        <WifiOff className="h-4 w-4" />
        <AlertTitle>WhatsApp Desconectado</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>Os envios estão pausados. Reconecte para continuar.</span>
          <Link to="/whatsapp">
            <Button size="sm" variant="outline" className="ml-4">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reconectar
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  // Alerta: QR Code necessário
  if (effectiveStatus === "QR_REQUIRED") {
    alerts.push(
      <Alert key="qr" className="border-warning/50 bg-warning/10">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertTitle className="text-warning">Ação Necessária</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>Escaneie o QR Code para conectar o WhatsApp.</span>
          <Link to="/whatsapp">
            <Button size="sm" variant="outline" className="ml-4">
              Ver QR Code
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  // Alerta: Cooldown ativo
  if (workerStatus?.cooldown?.active) {
    const remainingSecs = Math.ceil((workerStatus.cooldown.remainingMs || 0) / 1000);
    const remainingMins = Math.ceil(remainingSecs / 60);
    
    alerts.push(
      <Alert key="cooldown" className="border-warning/50 bg-warning/10">
        <Clock className="h-4 w-4 text-warning" />
        <AlertTitle className="text-warning">Envios Pausados (Cooldown)</AlertTitle>
        <AlertDescription>
          Foram detectados {workerStatus.cooldown.consecutiveErrors} erros consecutivos. 
          Envios pausados por segurança. Tempo restante: ~{remainingMins} min.
        </AlertDescription>
      </Alert>
    );
  }

  // Alerta: Auto-reconnect bloqueado
  if (workerStatus?.autoReconnect?.blocked) {
    alerts.push(
      <Alert key="blocked" variant="destructive" className="border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Reconexão Bloqueada</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            Motivo: {workerStatus.autoReconnect.reason || "Desconhecido"}. 
            É necessário reconectar manualmente.
          </span>
          <Link to="/whatsapp">
            <Button size="sm" variant="outline" className="ml-4">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reconectar
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {alerts}
    </div>
  );
}
