-- Fix overly permissive storage policy created for whatsapp-session bucket
-- Ensure only service role can manage these objects via RLS (anon/auth users denied)
DROP POLICY IF EXISTS "Service role can manage whatsapp session files" ON storage.objects;

CREATE POLICY "Only service role can manage whatsapp session files"
ON storage.objects
FOR ALL
USING (bucket_id = 'whatsapp-session' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'whatsapp-session' AND auth.role() = 'service_role');

-- Fix linter: function search_path should be immutable
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;