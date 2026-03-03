export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      model_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          message_index: number
          model_id: number
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          message_index: number
          model_id: number
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message_index?: number
          model_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_messages_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          delay_max_seconds: number
          delay_min_seconds: number
          id: number
          is_active: boolean
          last_query_at: string | null
          name: string
          query_interval_minutes: number
          sql_query: string | null
          updated_at: string
        }
        Insert: {
          delay_max_seconds?: number
          delay_min_seconds?: number
          id: number
          is_active?: boolean
          last_query_at?: string | null
          name: string
          query_interval_minutes?: number
          sql_query?: string | null
          updated_at?: string
        }
        Update: {
          delay_max_seconds?: number
          delay_min_seconds?: number
          id?: number
          is_active?: boolean
          last_query_at?: string | null
          name?: string
          query_interval_minutes?: number
          sql_query?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      send_logs: {
        Row: {
          created_at: string
          details: Json | null
          event: string
          id: string
          queue_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event: string
          id?: string
          queue_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event?: string
          id?: string
          queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "send_logs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "send_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      send_queue: {
        Row: {
          attempts: number
          cpf: string
          created_at: string
          error_message: string | null
          id: string
          model_id: number | null
          patient_name: string
          phone: string
          protocol: string
          result_link: string
          scheduled_date: string | null
          sent_at: string | null
          sequence_num: number
          status: Database["public"]["Enums"]["send_status"]
          template_id: number | null
          updated_at: string
          variables: Json | null
        }
        Insert: {
          attempts?: number
          cpf: string
          created_at?: string
          error_message?: string | null
          id?: string
          model_id?: number | null
          patient_name: string
          phone: string
          protocol: string
          result_link: string
          scheduled_date?: string | null
          sent_at?: string | null
          sequence_num: number
          status?: Database["public"]["Enums"]["send_status"]
          template_id?: number | null
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          attempts?: number
          cpf?: string
          created_at?: string
          error_message?: string | null
          id?: string
          model_id?: number | null
          patient_name?: string
          phone?: string
          protocol?: string
          result_link?: string
          scheduled_date?: string | null
          sent_at?: string | null
          sequence_num?: number
          status?: Database["public"]["Enums"]["send_status"]
          template_id?: number | null
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          delay_max_seconds: number
          delay_min_seconds: number
          id: string
          import_interval_minutes: number
          is_sending_enabled: boolean
          last_import_at: string | null
          send_window_end: string
          send_window_start: string
          updated_at: string
        }
        Insert: {
          delay_max_seconds?: number
          delay_min_seconds?: number
          id?: string
          import_interval_minutes?: number
          is_sending_enabled?: boolean
          last_import_at?: string | null
          send_window_end?: string
          send_window_start?: string
          updated_at?: string
        }
        Update: {
          delay_max_seconds?: number
          delay_min_seconds?: number
          id?: string
          import_interval_minutes?: number
          is_sending_enabled?: boolean
          last_import_at?: string | null
          send_window_end?: string
          send_window_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_session: {
        Row: {
          id: string
          last_seen_at: string | null
          lock_acquired_at: string | null
          lock_expires_at: string | null
          lock_holder: string | null
          qr_code: string | null
          session_data: Json | null
          status: Database["public"]["Enums"]["whatsapp_status"]
          updated_at: string
        }
        Insert: {
          id?: string
          last_seen_at?: string | null
          lock_acquired_at?: string | null
          lock_expires_at?: string | null
          lock_holder?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
        }
        Update: {
          id?: string
          last_seen_at?: string | null
          lock_acquired_at?: string | null
          lock_expires_at?: string | null
          lock_holder?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_whatsapp_lock: {
        Args: { p_duration_seconds?: number; p_holder: string }
        Returns: boolean
      }
      release_whatsapp_lock: { Args: { p_holder: string }; Returns: boolean }
      renew_whatsapp_lock: {
        Args: { p_duration_seconds?: number; p_holder: string }
        Returns: boolean
      }
    }
    Enums: {
      send_status: "PENDING" | "SENT" | "ERROR" | "SKIPPED"
      whatsapp_status: "DISCONNECTED" | "QR_REQUIRED" | "CONNECTED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      send_status: ["PENDING", "SENT", "ERROR", "SKIPPED"],
      whatsapp_status: ["DISCONNECTED", "QR_REQUIRED", "CONNECTED"],
    },
  },
} as const
