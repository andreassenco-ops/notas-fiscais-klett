-- ============================================
-- FIX: PUBLIC_DATA_EXPOSURE
-- Restrict SELECT policies to authenticated users only
-- ============================================

-- Drop existing public SELECT policies
DROP POLICY IF EXISTS "settings_select" ON public.settings;
DROP POLICY IF EXISTS "whatsapp_session_select" ON public.whatsapp_session;
DROP POLICY IF EXISTS "send_queue_select" ON public.send_queue;
DROP POLICY IF EXISTS "send_logs_select" ON public.send_logs;
DROP POLICY IF EXISTS "models_select" ON public.models;
DROP POLICY IF EXISTS "model_messages_select" ON public.model_messages;

-- Create authenticated-only SELECT policies
CREATE POLICY "Authenticated users can view settings" ON public.settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view whatsapp session" ON public.whatsapp_session
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view queue" ON public.send_queue
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view logs" ON public.send_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view models" ON public.models
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view model messages" ON public.model_messages
  FOR SELECT USING (auth.role() = 'authenticated');