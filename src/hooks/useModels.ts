import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, isWorkerConfigured } from "@/lib/api-client";
import { toast } from "sonner";

export interface Model {
  id: number;
  name: string;
  is_active: boolean;
  sql_query: string | null;
  query_interval_minutes: number;
  last_query_at: string | null;
  delay_min_seconds: number;
  delay_max_seconds: number;
  updated_at: string;
}

export interface ModelMessage {
  id: string;
  model_id: number;
  message_index: number;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      if (isWorkerConfigured()) return api.getModels() as Promise<Model[]>;
      const { data, error } = await supabase.from("models").select("*").order("id", { ascending: true });
      if (error) throw error;
      return data as Model[];
    },
  });
}

export function useModel(id: number) {
  return useQuery({
    queryKey: ["models", id],
    queryFn: async () => {
      if (isWorkerConfigured()) return api.getModel(id) as Promise<Model>;
      const { data, error } = await supabase.from("models").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Model;
    },
    enabled: !!id,
  });
}

export function useModelMessages(modelId: number) {
  return useQuery({
    queryKey: ["model-messages", modelId],
    queryFn: async () => {
      if (isWorkerConfigured()) return api.getModelMessages(modelId) as Promise<ModelMessage[]>;
      const { data, error } = await supabase
        .from("model_messages").select("*").eq("model_id", modelId).order("message_index", { ascending: true });
      if (error) throw error;
      return data as ModelMessage[];
    },
    enabled: !!modelId,
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Model> }) => {
      if (isWorkerConfigured()) {
        const result = await api.updateModel(id, updates as Record<string, unknown>);
        return (result as any).data as Model;
      }
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'update', table: 'models', data: updates, id }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update model');
      return data.data?.[0] as Model;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["models", variables.id] });
      toast.success("Modelo atualizado");
    },
    onError: (error) => { toast.error("Erro ao atualizar modelo"); console.error(error); },
  });
}

export function useUpsertModelMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ modelId, messageIndex, body, isActive }: {
      modelId: number; messageIndex: number; body: string; isActive?: boolean;
    }) => {
      if (isWorkerConfigured()) {
        const result = await api.upsertModelMessage({
          model_id: modelId, message_index: messageIndex, body, is_active: isActive ?? true,
        });
        return (result as any).data as ModelMessage;
      }
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'upsert', table: 'model_messages', data: {
          model_id: modelId, message_index: messageIndex, body, is_active: isActive ?? true,
        }}
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to save message');
      return data.data?.[0] as ModelMessage;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["model-messages", variables.modelId] });
      toast.success("Mensagem salva");
    },
    onError: (error) => { toast.error("Erro ao salvar mensagem"); console.error(error); },
  });
}

export function useToggleModelMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, modelId, isActive }: { id: string; modelId: number; isActive: boolean }) => {
      if (isWorkerConfigured()) {
        const result = await api.updateModelMessage(id, { is_active: isActive });
        return (result as any).data as ModelMessage;
      }
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'update', table: 'model_messages', data: { is_active: isActive }, id }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to toggle message');
      return data.data?.[0] as ModelMessage;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["model-messages", variables.modelId] });
    },
    onError: (error) => { toast.error("Erro ao atualizar mensagem"); console.error(error); },
  });
}

export function useDeleteModelMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, modelId }: { id: string; modelId: number }) => {
      if (isWorkerConfigured()) {
        return api.deleteModelMessage(id);
      }
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'delete', table: 'model_messages', id }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to delete message');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["model-messages", variables.modelId] });
      toast.success("Mensagem removida");
    },
    onError: (error) => { toast.error("Erro ao remover mensagem"); console.error(error); },
  });
}
