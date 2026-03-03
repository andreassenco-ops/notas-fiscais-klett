import { Play, Pause } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface SendingToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isLoading?: boolean;
}

export function SendingToggle({ enabled, onToggle, isLoading }: SendingToggleProps) {
  return (
    <div className="stats-card card-hover">
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-3 rounded-xl transition-colors",
                enabled ? "bg-success/10" : "bg-muted"
              )}
            >
              {enabled ? (
                <Play className="h-6 w-6 text-success" />
              ) : (
                <Pause className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Envio de Mensagens
              </p>
              <p
                className={cn(
                  "text-lg font-semibold mt-0.5",
                  enabled ? "text-success" : "text-muted-foreground"
                )}
              >
                {enabled ? "Ativo" : "Pausado"}
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={isLoading}
            className="data-[state=checked]:bg-success"
          />
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          {enabled
            ? "Mensagens estão sendo processadas automaticamente"
            : "O processamento de mensagens está pausado"}
        </p>
      </div>
    </div>
  );
}
