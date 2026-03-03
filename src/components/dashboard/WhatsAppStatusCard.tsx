import { Smartphone, Wifi, WifiOff, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type WhatsAppStatus = "CONNECTED" | "DISCONNECTED" | "QR_REQUIRED";

interface WhatsAppStatusCardProps {
  status: WhatsAppStatus;
  lastSeen?: string;
}

const statusConfig = {
  CONNECTED: {
    label: "Conectado",
    description: "WhatsApp ativo e pronto para enviar",
    icon: Wifi,
    bgClass: "bg-success/10",
    textClass: "text-success",
    badgeClass: "status-connected",
  },
  DISCONNECTED: {
    label: "Desconectado",
    description: "Reconecte para continuar enviando",
    icon: WifiOff,
    bgClass: "bg-muted",
    textClass: "text-muted-foreground",
    badgeClass: "status-disconnected",
  },
  QR_REQUIRED: {
    label: "QR Code Necessário",
    description: "Escaneie o código para conectar",
    icon: QrCode,
    bgClass: "bg-warning/10",
    textClass: "text-warning",
    badgeClass: "status-pending",
  },
};

export function WhatsAppStatusCard({ status, lastSeen }: WhatsAppStatusCardProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="stats-card card-hover">
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-3 rounded-xl", config.bgClass)}>
              <Smartphone className={cn("h-6 w-6", config.textClass)} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Status WhatsApp
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                    config.badgeClass
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-3">
          {config.description}
        </p>

        {lastSeen && status === "CONNECTED" && (
          <p className="text-xs text-muted-foreground mt-2">
            Último ping: {lastSeen}
          </p>
        )}

        {status !== "CONNECTED" && (
          <Link to="/whatsapp">
            <Button variant="outline" size="sm" className="mt-4 w-full">
              <QrCode className="h-4 w-4 mr-2" />
              Conectar WhatsApp
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
