-- Rename templates to models and add new fields
ALTER TABLE public.templates RENAME TO models;

-- Add delay fields specific to each model
ALTER TABLE public.models
ADD COLUMN delay_min_seconds integer NOT NULL DEFAULT 40,
ADD COLUMN delay_max_seconds integer NOT NULL DEFAULT 100;

-- Create table for message variations (15 per model)
CREATE TABLE public.model_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id integer NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  message_index integer NOT NULL CHECK (message_index >= 1 AND message_index <= 15),
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(model_id, message_index)
);

-- Enable RLS
ALTER TABLE public.model_messages ENABLE ROW LEVEL SECURITY;

-- Create permissive policy (MVP)
CREATE POLICY "Allow all for model_messages" ON public.model_messages FOR ALL USING (true) WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_model_messages_updated_at
  BEFORE UPDATE ON public.model_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing body to first message variation for each model
INSERT INTO public.model_messages (model_id, message_index, body)
SELECT id, 1, body FROM public.models;

-- Remove old body column from models (we now use model_messages)
ALTER TABLE public.models DROP COLUMN body;