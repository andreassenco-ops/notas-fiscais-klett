-- =====================================================
-- KLETT WHATS SENDER - DATABASE SCHEMA
-- =====================================================

-- Enum para status da fila de envio
CREATE TYPE public.send_status AS ENUM ('PENDING', 'SENT', 'ERROR', 'SKIPPED');

-- Enum para status da sessão WhatsApp
CREATE TYPE public.whatsapp_status AS ENUM ('DISCONNECTED', 'QR_REQUIRED', 'CONNECTED');

-- =====================================================
-- 1. SETTINGS - Configurações globais do sistema
-- =====================================================
CREATE TABLE public.settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    send_window_start text NOT NULL DEFAULT '06:00',
    send_window_end text NOT NULL DEFAULT '21:00',
    delay_min_seconds integer NOT NULL DEFAULT 40,
    delay_max_seconds integer NOT NULL DEFAULT 100,
    import_interval_minutes integer NOT NULL DEFAULT 60,
    is_sending_enabled boolean NOT NULL DEFAULT true,
    last_import_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir configuração inicial
INSERT INTO public.settings (id) VALUES (gen_random_uuid());

-- =====================================================
-- 2. TEMPLATES - 15 templates de mensagem
-- =====================================================
CREATE TABLE public.templates (
    id integer PRIMARY KEY,
    name text NOT NULL,
    body text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir os 15 templates iniciais
INSERT INTO public.templates (id, name, body) VALUES
(1, 'Template Padrão', 'Olá {NOME}! 👋

Seu resultado de exame já está disponível.

🔗 Acesse aqui: {LINK}
📋 CPF para login: {CPF}

Klett Laboratório'),
(2, 'Template 2', 'Prezado(a) {NOME},

Informamos que seu exame está pronto para consulta.

Acesse: {LINK}
Utilize seu CPF: {CPF}

Att, Klett Laboratório'),
(3, 'Template 3', '{NOME}, bom dia!

Seus resultados estão disponíveis em: {LINK}
Entre com o CPF: {CPF}

Klett Lab 🔬'),
(4, 'Template 4', 'Olá {NOME}!

Exame liberado ✅
Link: {LINK}
CPF: {CPF}

Klett Laboratório'),
(5, 'Template 5', 'Oi {NOME}, tudo bem?

Seu resultado já pode ser acessado!
🔗 {LINK}
📋 CPF: {CPF}

Klett Lab'),
(6, 'Template 6', '{NOME}, seu exame está pronto!

Acesse pelo link: {LINK}
Use seu CPF: {CPF}

Equipe Klett'),
(7, 'Template 7', 'Prezado(a) {NOME},

Resultado disponível para download.
Link: {LINK}
CPF: {CPF}

Klett Laboratório'),
(8, 'Template 8', 'Olá {NOME}! 🏥

Seu laudo foi liberado.
🔗 {LINK}
📋 CPF: {CPF}

Klett Lab'),
(9, 'Template 9', '{NOME},

Seu exame está pronto para visualização.
Acesse: {LINK}
CPF para acesso: {CPF}

Klett'),
(10, 'Template 10', 'Boa tarde {NOME}!

Resultado liberado ✓
Link: {LINK}
CPF: {CPF}

Klett Laboratório'),
(11, 'Template 11', '{NOME}, exame disponível!

🔗 Resultado: {LINK}
🔐 CPF: {CPF}

Att, Klett Lab'),
(12, 'Template 12', 'Olá {NOME}!

Seu resultado de laboratório está pronto.
Acesse em: {LINK}
Informe o CPF: {CPF}

Klett'),
(13, 'Template 13', 'Prezado(a) {NOME},

Exame finalizado e disponível online.
Link de acesso: {LINK}
CPF: {CPF}

Klett Laboratório'),
(14, 'Template 14', '{NOME}, temos novidades! 📋

Resultado pronto: {LINK}
Seu CPF: {CPF}

Klett Lab'),
(15, 'Template 15', 'Olá {NOME}!

Laudo liberado com sucesso ✅
🔗 {LINK}
📋 {CPF}

Equipe Klett Laboratório');

-- =====================================================
-- 3. SEND_QUEUE - Fila de envios
-- =====================================================
CREATE TABLE public.send_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol text NOT NULL,
    cpf text NOT NULL,
    patient_name text NOT NULL,
    phone text NOT NULL,
    result_link text NOT NULL,
    sequence_num bigint NOT NULL,
    template_id integer REFERENCES public.templates(id),
    status public.send_status NOT NULL DEFAULT 'PENDING',
    error_message text,
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    UNIQUE(protocol, cpf)
);

-- Índices para performance
CREATE INDEX idx_send_queue_status ON public.send_queue(status);
CREATE INDEX idx_send_queue_sequence ON public.send_queue(sequence_num);
CREATE INDEX idx_send_queue_pending ON public.send_queue(status, sequence_num) WHERE status = 'PENDING';

-- Sequence para sequence_num
CREATE SEQUENCE public.send_queue_sequence_seq START 1;

-- =====================================================
-- 4. WHATSAPP_SESSION - Sessão do WhatsApp
-- =====================================================
CREATE TABLE public.whatsapp_session (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status public.whatsapp_status NOT NULL DEFAULT 'DISCONNECTED',
    qr_code text,
    last_seen_at timestamptz,
    session_data jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir sessão inicial
INSERT INTO public.whatsapp_session (id) VALUES (gen_random_uuid());

-- =====================================================
-- 5. SEND_LOGS - Logs de auditoria
-- =====================================================
CREATE TABLE public.send_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id uuid REFERENCES public.send_queue(id) ON DELETE SET NULL,
    event text NOT NULL,
    details jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_send_logs_queue ON public.send_logs(queue_id);
CREATE INDEX idx_send_logs_event ON public.send_logs(event);
CREATE INDEX idx_send_logs_created ON public.send_logs(created_at DESC);

-- =====================================================
-- TRIGGERS para updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON public.templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_send_queue_updated_at
    BEFORE UPDATE ON public.send_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_session_updated_at
    BEFORE UPDATE ON public.whatsapp_session
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS POLICIES (preparado para futuro - por ora aberto)
-- =====================================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_logs ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para MVP (sem auth por enquanto)
CREATE POLICY "Allow all for settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for templates" ON public.templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for send_queue" ON public.send_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for whatsapp_session" ON public.whatsapp_session FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for send_logs" ON public.send_logs FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- ENABLE REALTIME para status em tempo real
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_session;
ALTER PUBLICATION supabase_realtime ADD TABLE public.send_queue;