import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";
import { toast } from "sonner";

export interface Settings {
  id: string;
  send_window_start: string;
  send_window_end: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
  import_interval_minutes: number;
  is_sending_enabled: boolean;
  last_import_at: string | null;
  updated_at: string;
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      if (isWorkerConfigured()) {
        return api.getSettings() as Promise<Settings | null>;
      }

      const { data, error } = await supabase
        .from("settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Settings>) => {
      if (isWorkerConfigured()) {
        const result = await api.updateSettings(updates as Record<string, unknown>);
        return (result as any).data as Settings;
      }

      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'update', table: 'settings', data: updates, filters: {} }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update settings');
      return data.data?.[0] as Settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Configurações atualizadas");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar configurações");
      console.error(error);
    },
  });
}
