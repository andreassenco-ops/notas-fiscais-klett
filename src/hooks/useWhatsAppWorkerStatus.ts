import { useQuery } from "@tanstack/react-query";
import { api, isWorkerConfigured } from "@/lib/api-client";

export type WorkerWhatsAppStatusResponse = {
  success: boolean;
  dbStatus?: "CONNECTED" | "DISCONNECTED" | "QR_REQUIRED" | "UNKNOWN";
  lastSeenAt?: string | null;
  realConnection?: {
    connected: boolean;
    state?: string | null;
    error?: string;
  };
  stats?: {
    pingFailures: number;
    lastSuccessfulPing: string | null;
    isHeartbeatRunning: boolean;
    workerId: string;
    isLockRenewalRunning: boolean;
  };
  autoReconnect?: {
    blocked: boolean;
    reason: string | null;
  };
  cooldown?: {
    active: boolean;
    remainingMs: number;
    consecutiveErrors: number;
  };
  lock?: {
    lockHolder: string | null;
    lockAcquiredAt: string | null;
    lockExpiresAt: string | null;
    isLocked: boolean;
  };
  error?: string;
};

async function fetchWorkerStatus(): Promise<WorkerWhatsAppStatusResponse> {
  if (isWorkerConfigured()) {
    return api.getWhatsAppWorkerStatus() as Promise<WorkerWhatsAppStatusResponse>;
  }

  // Fallback: via Supabase Edge Function
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-control?action=status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );

  return (await response.json()) as WorkerWhatsAppStatusResponse;
}

export function useWhatsAppWorkerStatus(options?: {
  enabled?: boolean;
  refetchIntervalMs?: number;
}) {
  return useQuery({
    queryKey: ["whatsapp-worker-status"],
    queryFn: fetchWorkerStatus,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchIntervalMs ?? false,
    retry: 1,
  });
}
