import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";

export interface HistoricalSend {
  id: string;
  phone: string;
  patient_name: string;
  protocol: string;
  cpf: string;
  status: "SENT" | "TEST_SENT" | "ERROR";
  sent_at: string;
  model_name?: string;
  source: "queue" | "log";
  error_message?: string;
  verified_number?: string;
  message_id?: string;
}

interface UseHistoricalSendsOptions {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: "all" | "SENT" | "ERROR";
}

export interface PaginatedHistoryResult {
  items: HistoricalSend[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export function useHistoricalSends(options: UseHistoricalSendsOptions = {}) {
  const { search, page = 1, pageSize = 50, status = "all" } = options;

  return useQuery({
    queryKey: ["historical-sends", search, page, pageSize, status],
    queryFn: async (): Promise<PaginatedHistoryResult> => {
      if (isWorkerConfigured()) {
        return api.getHistoricalSends({ search, page, pageSize, status }) as Promise<PaginatedHistoryResult>;
      }

      // Fallback: Supabase (original logic)
      let queueQuery = supabase
        .from("send_queue")
        .select(`id, phone, patient_name, protocol, cpf, status, sent_at, error_message, models:model_id (name)`)
        .in("status", status === "all" ? ["SENT", "ERROR"] : [status])
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false });

      if (search) {
        queueQuery = queueQuery.or(
          `protocol.ilike.%${search}%,cpf.ilike.%${search}%,patient_name.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }

      const { data: queueData, error: queueError } = await queueQuery;
      if (queueError) throw queueError;

      const { data: logsData, error: logsError } = await supabase
        .from("send_logs").select("*")
        .in("event", status === "ERROR" ? ["SEND_ERROR"] : ["SENT", "TEST_SENT"])
        .order("created_at", { ascending: false });
      if (logsError) throw logsError;

      const queueItems: HistoricalSend[] = (queueData || []).map((item: any) => ({
        id: item.id, phone: item.phone, patient_name: item.patient_name,
        protocol: item.protocol, cpf: item.cpf,
        status: item.status === "ERROR" ? "ERROR" : "SENT",
        sent_at: item.sent_at, model_name: item.models?.name || undefined,
        source: "queue" as const, error_message: item.error_message,
      }));

      const queueIds = new Set(queueItems.map((item) => item.id));
      const logItems: HistoricalSend[] = [];
      for (const log of logsData || []) {
        if (log.queue_id && queueIds.has(log.queue_id)) continue;
        const details = log.details as Record<string, unknown> | null;
        if (!details) continue;
        const phone = (details.verified_number || details.phone) as string | undefined;
        if (!phone) continue;
        logItems.push({
          id: log.id, phone,
          patient_name: (details.patient_name as string) || "N/A",
          protocol: (details.protocol as string) || "N/A",
          cpf: (details.cpf as string) || "N/A",
          status: log.event === "SEND_ERROR" ? "ERROR" : (log.event as "SENT" | "TEST_SENT"),
          sent_at: log.created_at,
          model_name: (details.model_name as string) || undefined,
          source: "log" as const,
          verified_number: details.verified_number as string | undefined,
          message_id: details.message_id as string | undefined,
          error_message: details.error as string | undefined,
        });
      }

      let allItems = [...queueItems, ...logItems];
      allItems.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

      if (search) {
        const searchLower = search.toLowerCase();
        allItems = allItems.filter((item) =>
          item.protocol.toLowerCase().includes(searchLower) ||
          item.cpf.toLowerCase().includes(searchLower) ||
          item.patient_name.toLowerCase().includes(searchLower) ||
          item.phone.includes(search)
        );
      }

      const totalCount = allItems.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const start = (page - 1) * pageSize;
      const items = allItems.slice(start, start + pageSize);

      return { items, totalCount, totalPages, currentPage: page };
    },
    staleTime: 30000,
  });
}

export function useHistoricalStats() {
  return useQuery({
    queryKey: ["historical-stats"],
    queryFn: async () => {
      if (isWorkerConfigured()) {
        return api.getHistoricalStats() as Promise<{
          totalMessages: number; uniqueContacts: number; sentMessages: number; testMessages: number;
        }>;
      }

      const { data: logs, error } = await supabase
        .from("send_logs").select("id, event, details").in("event", ["SENT", "TEST_SENT"]);
      if (error) throw error;

      const uniquePhones = new Set<string>();
      let totalSent = 0, totalTest = 0;

      for (const log of logs || []) {
        const details = log.details as Record<string, unknown> | null;
        const phone = (details?.verified_number || details?.phone) as string | undefined;
        if (phone) {
          const digits = phone.replace(/\D/g, "");
          if (digits.length >= 11) uniquePhones.add(digits.slice(-11));
        }
        if (log.event === "SENT") totalSent++;
        if (log.event === "TEST_SENT") totalTest++;
      }

      return {
        totalMessages: logs?.length || 0,
        uniqueContacts: uniquePhones.size,
        sentMessages: totalSent,
        testMessages: totalTest,
      };
    },
    staleTime: 60000,
  });
}
