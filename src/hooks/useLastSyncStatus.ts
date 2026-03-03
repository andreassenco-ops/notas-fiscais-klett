import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";

export interface LastSyncStatus {
  lastQueryAt: string | null;
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  modelName: string | null;
}

export function useLastSyncStatus() {
  return useQuery({
    queryKey: ["last-sync-status"],
    queryFn: async (): Promise<LastSyncStatus> => {
      if (isWorkerConfigured()) {
        return api.getLastSyncStatus() as Promise<LastSyncStatus>;
      }

      const { data: lastLog } = await supabase
        .from("send_logs").select("details, created_at")
        .eq("event", "MODEL_QUERY_EXECUTED")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const details = lastLog?.details as Record<string, unknown> | null;
      const isModel7 = details?.model_id === 7;

      return {
        lastQueryAt: lastLog?.created_at ?? null,
        modelName: isModel7 ? (details?.model_name as string ?? null) : null,
        total: isModel7 ? (details?.total as number ?? 0) : 0,
        inserted: isModel7 ? (details?.inserted as number ?? 0) : 0,
        skipped: isModel7 ? (details?.skipped as number ?? 0) : 0,
        errors: isModel7 ? (details?.errors as number ?? 0) : 0,
      };
    },
    refetchInterval: 60000,
  });
}
