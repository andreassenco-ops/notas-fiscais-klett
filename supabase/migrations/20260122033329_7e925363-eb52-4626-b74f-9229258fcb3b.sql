-- Adicionar campo scheduled_date para registrar a data de referência do exame
ALTER TABLE public.send_queue 
ADD COLUMN scheduled_date date DEFAULT CURRENT_DATE;

-- Comentário explicativo
COMMENT ON COLUMN public.send_queue.scheduled_date IS 'Data de referência do exame (quando ficou pronto), para controle de acúmulo diário';