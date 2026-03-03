import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";

export interface MonthlyStats {
  sentThisMonth: number;
}

export function useMonthlyStats() {
  return useQuery({
    queryKey: ["monthly-stats"],
    queryFn: async (): Promise<MonthlyStats> => {
      if (isWorkerConfigured()) return api.getMonthlyStats();

      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 3, 0, 0));
      const { count } = await supabase
        .from("send_queue").select("id", { count: "exact", head: true })
        .eq("status", "SENT").gte("sent_at", startOfMonth.toISOString());
      return { sentThisMonth: count ?? 0 };
    },
    refetchInterval: 60000,
  });
}
