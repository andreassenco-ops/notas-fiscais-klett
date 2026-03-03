-- Allow anon key to read model_messages (safe: no sensitive data)
-- This is needed for the local robot to fetch message templates

DROP POLICY IF EXISTS "Anon can read model messages" ON public.model_messages;
CREATE POLICY "Anon can read model messages" 
ON public.model_messages 
FOR SELECT 
USING (true);

-- Also allow anon to read models table
DROP POLICY IF EXISTS "Anon can read models" ON public.models;
CREATE POLICY "Anon can read models" 
ON public.models 
FOR SELECT 
USING (true);