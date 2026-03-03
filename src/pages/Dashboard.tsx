import { Clock, Send, AlertTriangle, TrendingUp, FileText, ClipboardList } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { SendingToggle } from "@/components/dashboard/SendingToggle";
import { LastSyncCard } from "@/components/dashboard/LastSyncCard";
import { MonthlySentCard } from "@/components/dashboard/MonthlySentCard";
import { QueueTable, QueueItem } from "@/components/dashboard/QueueTable";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useSendQueue, useQueueStats, useResendMessage } from "@/hooks/useSendQueue";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: queueData, isLoading: queueLoading } = useSendQueue({ page: 1, pageSize: 50 });
  const { data: stats, isLoading: statsLoading } = useQueueStats();
  
  const updateSettings = useUpdateSettings();
  const resendMessage = useResendMessage();

  const handleToggleSending = (enabled: boolean) => {
    updateSettings.mutate({ is_sending_enabled: enabled });
  };

  const handleResend = (id: string) => {
    resendMessage.mutate(id);
  };

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do sistema de envio de resultados
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {/* Sending Toggle */}
          {settingsLoading ? (
            <Skeleton className="h-36" />
          ) : (
            <SendingToggle
              enabled={settings?.is_sending_enabled ?? false}
              onToggle={handleToggleSending}
              isLoading={updateSettings.isPending}
            />
          )}

          {/* Stats Cards */}
          {statsLoading ? (
            <>
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </>
          ) : (
            <>
              <StatsCard
                title="Resultados Enviados"
                value={stats?.sentResultsToday ?? 0}
                icon={FileText}
                variant="success"
                description="M07 — Hoje"
              />
              <StatsCard
                title="Pesquisas Enviadas"
                value={stats?.sentSurveysToday ?? 0}
                icon={ClipboardList}
                variant="default"
                description="M14 — Hoje"
              />
              <StatsCard
                title="Total Enviados"
                value={stats?.sentToday ?? 0}
                icon={Send}
                variant="success"
                description="Todas as msgs hoje"
              />
              <StatsCard
                title="Erros Hoje"
                value={stats?.errorsToday ?? 0}
                icon={AlertTriangle}
                variant="destructive"
                description="Precisam de atenção"
              />
              <StatsCard
                title="Pendentes"
                value={stats?.pending ?? 0}
                icon={Clock}
                variant="warning"
                description="Aguardando envio"
              />
              <StatsCard
                title="Novos Hoje"
                value={stats?.createdToday ?? 0}
                icon={TrendingUp}
                variant="default"
                description="Criados hoje"
              />
            </>
          )}
          <MonthlySentCard />
          <LastSyncCard />
        </div>

        {/* Queue Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Fila de Envios</h2>
            <span className="text-sm text-muted-foreground">
              Últimos 50 registros
            </span>
          </div>
          
          {queueLoading ? (
            <Skeleton className="h-96" />
          ) : (
            <QueueTable
              items={(queueData?.items ?? []) as QueueItem[]}
              onResend={handleResend}
              isLoading={resendMessage.isPending}
            />
          )}
        </div>
      </div>
    </MainLayout>
  );
}
