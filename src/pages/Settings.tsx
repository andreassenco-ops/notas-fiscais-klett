import { useState, useEffect } from "react";
import {
  Clock,
  Timer,
  RefreshCw,
  Play,
  Pause,
  Save,
  Database,
  Activity,
  Globe,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDateTimeInSaoPaulo, formatDistanceInSaoPaulo } from "@/lib/timezone";
import { getWorkerUrl, isWorkerConfigured } from "@/lib/api-client";

// Hook para buscar estatísticas de atualização do banco
function useDatabaseStats() {
  return useQuery({
    queryKey: ["database-stats"],
    queryFn: async () => {
      const [queueStats, todayStats] = await Promise.all([
        supabase
          .from("send_queue")
          .select("created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("send_queue")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date().toISOString().split("T")[0]),
      ]);

      return {
        lastUpdate: queueStats.data?.updated_at || null,
        lastCreation: queueStats.data?.created_at || null,
        todayCount: todayStats.count || 0,
      };
    },
    refetchInterval: 30000, // Atualiza a cada 30s
  });
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: dbStats, isLoading: isLoadingStats } = useDatabaseStats();
  const updateSettings = useUpdateSettings();

  const [formData, setFormData] = useState({
    send_window_start: "06:00",
    send_window_end: "21:00",
    delay_min_seconds: 40,
    delay_max_seconds: 100,
    import_interval_minutes: 60,
    is_sending_enabled: true,
  });

  

  useEffect(() => {
    if (settings) {
      setFormData({
        send_window_start: settings.send_window_start,
        send_window_end: settings.send_window_end,
        delay_min_seconds: settings.delay_min_seconds,
        delay_max_seconds: settings.delay_max_seconds,
        import_interval_minutes: settings.import_interval_minutes,
        is_sending_enabled: settings.is_sending_enabled,
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(formData);
  };

  const handleTriggerImport = async () => {
    try {
      // Log via Edge Function
      await supabase.functions.invoke('admin-api', {
        body: {
          action: 'insert',
          table: 'send_logs',
          data: {
            event: "IMPORT_TRIGGERED",
            details: { triggered_at: new Date().toISOString() },
          }
        }
      });
      
      await updateSettings.mutateAsync({
        last_import_at: new Date().toISOString(),
      });
      
      toast.success("Importação solicitada ao servidor");
    } catch (error) {
      toast.error("Erro ao solicitar importação");
    }
  };

  const handleToggleSending = (enabled: boolean) => {
    updateSettings.mutate({ is_sending_enabled: enabled });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="animate-fade-in max-w-4xl">
          <div className="mb-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 mt-2" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="animate-fade-in max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Ajuste os parâmetros do sistema de envio
          </p>
        </div>

        {/* Status do Banco de Dados */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Status do Banco de Dados</CardTitle>
                <CardDescription>
                  Última sincronização com Autolac
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex gap-8">
                <Skeleton className="h-12 w-40" />
                <Skeleton className="h-12 w-32" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-6 md:gap-12">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Última Atualização
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {dbStats?.lastUpdate 
                      ? formatDateTimeInSaoPaulo(dbStats.lastUpdate)
                      : "—"}
                  </p>
                  {dbStats?.lastUpdate && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceInSaoPaulo(dbStats.lastUpdate)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Registros Hoje
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {dbStats?.todayCount ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dbStats?.todayCount && dbStats.todayCount > 0 
                      ? "✅ Dados sincronizados" 
                      : "⚠️ Nenhum dado hoje"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Worker Status */}
        <Card className="mb-6 border-accent/20 bg-accent/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-accent" />
              <span className="font-medium">Conexão Worker (Railway)</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {isWorkerConfigured() 
                  ? "✅ Conectado automaticamente" 
                  : "⏳ URL será carregada automaticamente do backend"}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Janela de Envio */}
          <Card className="card-hover">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Janela de Envio</CardTitle>
                  <CardDescription>
                    Horário permitido para envios
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start">Início</Label>
                  <Input
                    id="start"
                    type="time"
                    value={formData.send_window_start}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        send_window_start: e.target.value,
                      }))
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="end">Fim</Label>
                  <Input
                    id="end"
                    type="time"
                    value={formData.send_window_end}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        send_window_end: e.target.value,
                      }))
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Mensagens só serão enviadas dentro deste intervalo (horário de
                Brasília)
              </p>
            </CardContent>
          </Card>

          {/* Delay entre Envios */}
          <Card className="card-hover">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Timer className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">Delay entre Envios</CardTitle>
                  <CardDescription>
                    Intervalo aleatório entre mensagens
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="delayMin">Mínimo (segundos)</Label>
                  <Input
                    id="delayMin"
                    type="number"
                    min={10}
                    max={300}
                    value={formData.delay_min_seconds}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        delay_min_seconds: parseInt(e.target.value) || 40,
                      }))
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="delayMax">Máximo (segundos)</Label>
                  <Input
                    id="delayMax"
                    type="number"
                    min={10}
                    max={600}
                    value={formData.delay_max_seconds}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        delay_max_seconds: parseInt(e.target.value) || 100,
                      }))
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Um delay aleatório será aplicado entre cada envio
              </p>
            </CardContent>
          </Card>

          {/* Importação SQL Server */}
          <Card className="card-hover">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Database className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-lg">Importação Autolac</CardTitle>
                  <CardDescription>
                    Sincronização com SQL Server
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="interval">Intervalo (minutos)</Label>
                <Input
                  id="interval"
                  type="number"
                  min={5}
                  max={1440}
                  value={formData.import_interval_minutes}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      import_interval_minutes: parseInt(e.target.value) || 60,
                    }))
                  }
                  className="mt-1.5"
                />
              </div>
              {settings?.last_import_at && (
                <p className="text-xs text-muted-foreground">
                  Última importação:{" "}
                  {new Date(settings.last_import_at).toLocaleString("pt-BR")}
                </p>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleTriggerImport}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Rodar Importação Agora
              </Button>
            </CardContent>
          </Card>

          {/* Controle de Envio */}
          <Card className="card-hover">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  {formData.is_sending_enabled ? (
                    <Play className="h-5 w-5 text-success" />
                  ) : (
                    <Pause className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">Controle de Envio</CardTitle>
                  <CardDescription>
                    Pausar ou retomar envios
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Envio de Mensagens</p>
                  <p className="text-sm text-muted-foreground">
                    {formData.is_sending_enabled
                      ? "Ativo - processando fila"
                      : "Pausado - fila em espera"}
                  </p>
                </div>
                <Switch
                  checked={formData.is_sending_enabled}
                  onCheckedChange={(checked) => {
                    setFormData((prev) => ({
                      ...prev,
                      is_sending_enabled: checked,
                    }));
                    handleToggleSending(checked);
                  }}
                  className="data-[state=checked]:bg-success"
                />
              </div>
              <Button
                variant={formData.is_sending_enabled ? "destructive" : "default"}
                className="w-full"
                onClick={() => {
                  handleToggleSending(!formData.is_sending_enabled);
                  setFormData((prev) => ({
                    ...prev,
                    is_sending_enabled: !prev.is_sending_enabled,
                  }));
                }}
              >
                {formData.is_sending_enabled ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar Envios
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Retomar Envios
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Configurações
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
