-- Create storage bucket for WhatsApp session backup
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-session',
  'whatsapp-session',
  false,
  52428800, -- 50MB limit
  ARRAY['application/zip', 'application/octet-stream']
);

-- Allow the service role (worker) to manage files in this bucket
CREATE POLICY "Service role can manage whatsapp session files"
ON storage.objects
FOR ALL
USING (bucket_id = 'whatsapp-session')
WITH CHECK (bucket_id = 'whatsapp-session');