-- Adicionar campo para armazenar variáveis dinâmicas do modelo
ALTER TABLE public.send_queue 
ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}'::jsonb;

-- Adicionar campo model_id (separado do template_id legado)
ALTER TABLE public.send_queue 
ADD COLUMN IF NOT EXISTS model_id integer REFERENCES public.models(id);

-- Criar índice único para evitar duplicatas (protocolo + cpf + model_id)
CREATE UNIQUE INDEX IF NOT EXISTS send_queue_protocol_cpf_model_unique 
ON public.send_queue (protocol, cpf, model_id) 
WHERE model_id IS NOT NULL;

-- Índice para buscar itens pendentes por modelo
CREATE INDEX IF NOT EXISTS send_queue_model_status_idx 
ON public.send_queue (model_id, status);

-- Comentário explicativo
COMMENT ON COLUMN public.send_queue.variables IS 'Variáveis dinâmicas do modelo SQL (JSONB) - ex: {"NOME": "João", "PROTOCOLO": "12345"}';