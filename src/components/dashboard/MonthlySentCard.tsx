import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMonthlyStats } from "@/hooks/useMonthlyStats";
import { Skeleton } from "@/components/ui/skeleton";

export function MonthlySentCard() {
  const { data, isLoading, isError } = useMonthlyStats();

  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  if (isError) {
    return (
      <div className="stats-card card-hover">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Enviados no Mês</p>
            <p className="text-lg font-semibold text-destructive mt-1">Erro ao carregar</p>
          </div>
          <div className="p-2.5 rounded-lg bg-destructive/10">
            <CalendarDays className="h-5 w-5 text-destructive" />
          </div>
        </div>
      </div>
    );
  }

  const { sentThisMonth = 0 } = data ?? {};

  // Formatar nome do mês atual em português
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return (
    <div className="stats-card card-hover">
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Enviados no Mês
            </p>
            <p className={cn("text-3xl font-bold mt-1 tabular-nums text-primary")}>
              {sentThisMonth.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-2">
          Mensagens em {capitalizedMonth}
        </p>
      </div>
    </div>
  );
}
