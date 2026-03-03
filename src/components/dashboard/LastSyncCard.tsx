import { RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLastSyncStatus } from "@/hooks/useLastSyncStatus";
import { formatDistanceInSaoPaulo, formatDateTimeInSaoPaulo } from "@/lib/timezone";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LastSyncCard() {
  const { data, isLoading, isError } = useLastSyncStatus();

  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  if (isError || !data) {
    return (
      <div className="stats-card card-hover">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Última Sincronização</p>
            <p className="text-lg font-semibold text-destructive mt-1">Erro ao carregar</p>
          </div>
          <div className="p-2.5 rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
        </div>
      </div>
    );
  }

  const { lastQueryAt, inserted, skipped, total } = data;

  // Determinar status: ok se executou nos últimos 35 minutos
  const isRecent = lastQueryAt
    ? Date.now() - new Date(lastQueryAt).getTime() < 35 * 60 * 1000
    : false;

  const statusIcon = lastQueryAt
    ? isRecent
      ? CheckCircle2
      : Clock
    : AlertTriangle;

  const statusColor = lastQueryAt
    ? isRecent
      ? "success"
      : "warning"
    : "destructive";

  const iconBgStyles: Record<string, string> = {
    success: "bg-success/10",
    warning: "bg-warning/10",
    destructive: "bg-destructive/10",
  };

  const textStyles: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  const StatusIcon = statusIcon;

  return (
    <div className="stats-card card-hover">
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Última Sincronização
            </p>
            
            {lastQueryAt ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className={cn("text-lg font-semibold mt-1 cursor-help", textStyles[statusColor])}>
                    {formatDistanceInSaoPaulo(lastQueryAt)}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{formatDateTimeInSaoPaulo(lastQueryAt)}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <p className="text-lg font-semibold mt-1 text-muted-foreground">
                Nunca executou
              </p>
            )}
          </div>
          <div className={cn("p-2.5 rounded-lg", iconBgStyles[statusColor])}>
            <StatusIcon className={cn("h-5 w-5", textStyles[statusColor])} />
          </div>
        </div>

        {lastQueryAt && total > 0 && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              Total: <span className="font-medium text-foreground">{total}</span>
            </span>
            <span className="text-success">
              +{inserted} novos
            </span>
            <span className="text-muted-foreground">
              {skipped} existentes
            </span>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          Atualização automática a cada 30 min
        </p>
      </div>
    </div>
  );
}
