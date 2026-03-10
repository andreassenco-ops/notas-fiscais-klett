-- Create public bucket for NFS-e PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('nfse-pdfs', 'nfse-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read (public bucket)
CREATE POLICY "Public read nfse-pdfs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'nfse-pdfs');

-- Allow service role (worker) to insert
CREATE POLICY "Service role can upload nfse-pdfs"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'nfse-pdfs');