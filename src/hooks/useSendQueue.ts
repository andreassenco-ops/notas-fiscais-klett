import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";
import { toast } from "sonner";
import { useEffect } from "react";

export type SendStatus = "PENDING" | "SENT" | "ERROR" | "SKIPPED";

export interface SendQueueItem {
  id: string;
  protocol: string;
  cpf: string;
  patient_name: string;
  phone: string;
  result_link: string;
  sequence_num: number;
  template_id: number | null;
  model_id: number | null;
  model_name?: string;
  variables: Record<string, string> | null;
  status: SendStatus;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

interface UseQueueOptions {
  status?: SendStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedQueueResult {
  items: SendQueueItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export function useSendQueue(options: UseQueueOptions = {}) {
  const { status, search, page = 1, pageSize = 50 } = options;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["send-queue", status, search, page, pageSize],
    queryFn: async (): Promise<PaginatedQueueResult> => {
      if (isWorkerConfigured()) {
        const result = await api.getSendQueue({ status, search, page, pageSize });
        return result as PaginatedQueueResult;
      }

      // Fallback: Supabase
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let queryBuilder = supabase
        .from("send_queue")
        .select(`*, models:model_id (name)`, { count: "exact" })
        .order("sequence_num", { ascending: false })
        .range(from, to);

      if (status) queryBuilder = queryBuilder.eq("status", status);
      if (search) {
        queryBuilder = queryBuilder.or(
          `protocol.ilike.%${search}%,cpf.ilike.%${search}%,patient_name.ilike.%${search}%`
        );
      }

      const { data, error, count } = await queryBuilder;
      if (error) throw error;

      const totalCount = count ?? 0;
      const items = (data || []).map((item: any) => ({
        ...item,
        model_name: item.models?.name || null,
        models: undefined,
      })) as SendQueueItem[];

      return { items, totalCount, totalPages: Math.ceil(totalCount / pageSize), currentPage: page };
    },
  });

  // Realtime only for Supabase mode
  useEffect(() => {
    if (isWorkerConfigured()) return;
    const channel = supabase
      .channel("send-queue-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "send_queue" }, () => {
        queryClient.invalidateQueries({ queryKey: ["send-queue"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useQueueStats() {
  return useQuery({
    queryKey: ["queue-stats"],
    queryFn: async () => {
      if (isWorkerConfigured()) {
        return api.getQueueStats();
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [pendingResult, sentTodayResult, errorTodayResult, createdTodayResult] = await Promise.all([
        supabase.from("send_queue").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
        supabase.from("send_queue").select("id", { count: "exact", head: true }).eq("status", "SENT").gte("sent_at", today.toISOString()),
        supabase.from("send_queue").select("id", { count: "exact", head: true }).eq("status", "ERROR").gte("updated_at", today.toISOString()),
        supabase.from("send_queue").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      ]);

      return {
        pending: pendingResult.count ?? 0,
        sentToday: sentTodayResult.count ?? 0,
        errorsToday: errorTodayResult.count ?? 0,
        createdToday: createdTodayResult.count ?? 0,
        sentResultsToday: 0,
        sentSurveysToday: 0,
      };
    },
    refetchInterval: 10000,
  });
}

export function useResendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isWorkerConfigured()) {
        return api.resendMessage(id);
      }

      const { data: currentItem } = await supabase
        .from("send_queue").select("attempts").eq("id", id).single();
      const newAttempts = (currentItem?.attempts ?? 0) + 1;

      const { data, error } = await supabase
        .from("send_queue")
        .update({ status: "PENDING" as SendStatus, error_message: null, attempts: newAttempts })
        .eq("id", id).select().single();
      if (error) throw error;

      await supabase.from("send_logs").insert({
        queue_id: id, event: "MANUAL_RESEND",
        details: { resent_at: new Date().toISOString(), attempt_number: newAttempts },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["send-queue"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
      toast.success("Mensagem adicionada para reenvio");
    },
    onError: (error) => {
      toast.error("Erro ao reenviar mensagem");
      console.error(error);
    },
  });
}
