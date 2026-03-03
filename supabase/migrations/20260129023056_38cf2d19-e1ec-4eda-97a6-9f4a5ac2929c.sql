-- Remove políticas permissivas existentes
DROP POLICY IF EXISTS "Allow all for settings" ON public.settings;
DROP POLICY IF EXISTS "Allow all for whatsapp_session" ON public.whatsapp_session;
DROP POLICY IF EXISTS "Allow all for send_queue" ON public.send_queue;
DROP POLICY IF EXISTS "Allow all for send_logs" ON public.send_logs;
DROP POLICY IF EXISTS "Allow all for templates" ON public.models;
DROP POLICY IF EXISTS "Allow all for model_messages" ON public.model_messages;

-- Settings: leitura permitida, escrita via Edge Function ou Service Role
CREATE POLICY "settings_select" ON public.settings FOR SELECT USING (true);

-- WhatsApp Session: leitura para status no dashboard
CREATE POLICY "whatsapp_session_select" ON public.whatsapp_session FOR SELECT USING (true);

-- Send Queue: leitura para exibição da fila
CREATE POLICY "send_queue_select" ON public.send_queue FOR SELECT USING (true);

-- Send Logs: leitura para histórico
CREATE POLICY "send_logs_select" ON public.send_logs FOR SELECT USING (true);

-- Models: leitura para exibição dos modelos
CREATE POLICY "models_select" ON public.models FOR SELECT USING (true);

-- Model Messages: leitura para exibição das mensagens
CREATE POLICY "model_messages_select" ON public.model_messages FOR SELECT USING (true);