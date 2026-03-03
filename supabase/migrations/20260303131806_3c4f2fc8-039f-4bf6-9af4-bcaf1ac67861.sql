CREATE TABLE public.nfse_emitidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL,
  chave_acesso text,
  numero_nota text,
  ndps text,
  valor numeric(12,2),
  paciente_nome text,
  cpf text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_nfse_emitidas_protocolo ON public.nfse_emitidas(protocolo);

ALTER TABLE public.nfse_emitidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon and authenticated can read nfse_emitidas"
  ON public.nfse_emitidas FOR SELECT
  USING (true);

CREATE POLICY "Anon and authenticated can insert nfse_emitidas"
  ON public.nfse_emitidas FOR INSERT
  WITH CHECK (true);