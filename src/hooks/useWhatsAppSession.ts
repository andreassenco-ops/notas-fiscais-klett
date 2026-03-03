import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";
import { useEffect } from "react";
import { Json } from "@/integrations/supabase/types";

export type WhatsAppStatus = "CONNECTED" | "DISCONNECTED" | "QR_REQUIRED";

export interface WhatsAppSession {
  id: string;
  status: WhatsAppStatus;
  qr_code: string | null;
  last_seen_at: string | null;
  session_data: Json | null;
  updated_at: string;
}

export function useWhatsAppSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["whatsapp-session"],
    queryFn: async () => {
      if (isWorkerConfigured()) {
        return api.getWhatsAppSession() as Promise<WhatsAppSession | null>;
      }
      const { data, error } = await supabase
        .from("whatsapp_session").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as WhatsAppSession | null;
    },
    refetchInterval: 5000,
  });

  // Realtime only for Supabase mode
  useEffect(() => {
    if (isWorkerConfigured()) return;
    const channel = supabase
      .channel("whatsapp-session-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_session" }, () => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-session"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useUpdateWhatsAppSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<WhatsAppSession>) => {
      if (isWorkerConfigured()) {
        // Not typically needed from frontend in local mode
        throw new Error("WhatsApp session updates are managed by the worker");
      }
      const { data: current } = await supabase
        .from("whatsapp_session").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (!current) throw new Error("Session not found");
      const { data, error } = await supabase
        .from("whatsapp_session").update(updates).eq("id", current.id).select().single();
      if (error) throw error;
      return data as WhatsAppSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-session"] });
    },
  });
}
