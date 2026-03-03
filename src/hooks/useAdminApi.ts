import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type AdminAction = 'update' | 'insert' | 'delete' | 'upsert';

interface AdminApiParams {
  action: AdminAction;
  table: string;
  data?: Record<string, unknown>;
  id?: string | number;
  filters?: Record<string, unknown>;
}

interface AdminApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function callAdminApi(params: AdminApiParams): Promise<AdminApiResponse> {
  if (isWorkerConfigured()) {
    return api.adminApi(params) as Promise<AdminApiResponse>;
  }

  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: params,
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error || 'Operation failed');
  return data;
}

export function useAdminUpdate(table: string, invalidateQueries?: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, filters }: { id?: string | number; data: Record<string, unknown>; filters?: Record<string, unknown> }) => {
      return callAdminApi({ action: 'update', table, data, id, filters });
    },
    onSuccess: () => {
      invalidateQueries?.forEach(query => {
        queryClient.invalidateQueries({ queryKey: [query] });
      });
    },
  });
}

export function useAdminInsert(table: string, invalidateQueries?: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return callAdminApi({ action: 'insert', table, data });
    },
    onSuccess: () => {
      invalidateQueries?.forEach(query => {
        queryClient.invalidateQueries({ queryKey: [query] });
      });
    },
  });
}

export function useAdminDelete(table: string, invalidateQueries?: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | number) => {
      return callAdminApi({ action: 'delete', table, id });
    },
    onSuccess: () => {
      invalidateQueries?.forEach(query => {
        queryClient.invalidateQueries({ queryKey: [query] });
      });
    },
  });
}

export function useAdminUpsert(table: string, invalidateQueries?: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return callAdminApi({ action: 'upsert', table, data });
    },
    onSuccess: () => {
      invalidateQueries?.forEach(query => {
        queryClient.invalidateQueries({ queryKey: [query] });
      });
    },
  });
}
