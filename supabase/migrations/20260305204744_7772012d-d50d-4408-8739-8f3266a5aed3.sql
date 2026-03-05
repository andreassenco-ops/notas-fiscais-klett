
ALTER TABLE public.nfse_emitidas ADD COLUMN IF NOT EXISTS observacao text;

-- Allow updates on nfse_emitidas (for observacao edits)
CREATE POLICY "Anon and authenticated can update nfse_emitidas"
ON public.nfse_emitidas
FOR UPDATE
USING (true)
WITH CHECK (true);
