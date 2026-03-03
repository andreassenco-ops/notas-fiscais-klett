import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";

export function useSentPhones() {
  return useQuery({
    queryKey: ["sent-phones"],
    queryFn: async (): Promise<Set<string>> => {
      if (isWorkerConfigured()) {
        const phones = await api.getSentPhones();
        return new Set(phones);
      }

      const { data, error } = await supabase
        .from("send_logs").select("details").in("event", ["SENT", "TEST_SENT"]);
      if (error) throw error;

      const phones = new Set<string>();
      for (const row of data || []) {
        const details = row.details as Record<string, unknown> | null;
        if (!details) continue;
        const phoneValue = (details.verified_number || details.phone) as string | undefined;
        if (!phoneValue) continue;
        const digits = phoneValue.replace(/\D/g, "");
        if (digits.length >= 11) phones.add(digits.slice(-11));
      }
      return phones;
    },
    staleTime: 60000,
  });
}

export function normalizePhoneSuffix(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 11 ? digits.slice(-11) : digits;
}
