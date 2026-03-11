import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NfseItem {
  protocolo: string;
  pacienteNome: string;
  cpf: string;
  valor: number;
  chaveAcesso: string;
}

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  // Ensure country code 55
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const workerApiUrl = Deno.env.get("WORKER_API_URL");
    const sb = createClient(supabaseUrl, supabaseKey);

    const { items } = await req.json() as { items: NfseItem[] };
    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get next sequence_num
    const { data: maxSeq } = await sb
      .from("send_queue")
      .select("sequence_num")
      .order("sequence_num", { ascending: false })
      .limit(1)
      .single();
    let nextSeq = (maxSeq?.sequence_num || 0) + 1;

    const results: Array<{ protocolo: string; success: boolean; error?: string; phone?: string }> = [];
    let enqueued = 0;

    for (const item of items) {
      try {
        // 1) Check if already enqueued for this protocol + model 30
        const { data: existing } = await sb
          .from("send_queue")
          .select("id")
          .eq("protocol", item.protocolo)
          .eq("model_id", 30)
          .limit(1);
        if (existing && existing.length > 0) {
          results.push({ protocolo: item.protocolo, success: false, error: "Já enfileirado" });
          continue;
        }

        // 2) Look up phone: first from send_queue history (same CPF)
        let phone: string | null = null;
        const cleanCpf = item.cpf.replace(/\D/g, "");
        
        const { data: queueHistory } = await sb
          .from("send_queue")
          .select("phone")
          .eq("cpf", cleanCpf)
          .eq("status", "SENT")
          .order("sent_at", { ascending: false })
          .limit(1);
        
        if (queueHistory?.length && queueHistory[0].phone) {
          phone = queueHistory[0].phone;
        }

        // 3) Fallback: query SQL Server via Worker API
        if (!phone && workerApiUrl) {
          try {
            const sqlQuery = `SELECT TOP 1 CELULAR FROM PACIENTE WHERE CPF = '${cleanCpf}' AND CELULAR IS NOT NULL AND CELULAR <> ''`;
            const resp = await fetch(`${workerApiUrl.replace(/\/+$/, "")}/api/test-query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sql_query: sqlQuery, limit: 1 }),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.rows?.length > 0) {
                const raw = data.rows[0].CELULAR || data.rows[0].celular || "";
                phone = normalizePhone(String(raw));
              }
            }
          } catch {
            // Worker unavailable, skip
          }
        }

        if (!phone) {
          results.push({ protocolo: item.protocolo, success: false, error: "Telefone não encontrado" });
          continue;
        }

        // 4) Insert into send_queue
        const firstName = (item.pacienteNome || "").split(" ")[0] || "Cliente";
        const valorFormatted = item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const { error: insertErr } = await sb.from("send_queue").insert({
          protocol: item.protocolo,
          cpf: cleanCpf,
          patient_name: item.pacienteNome,
          phone,
          result_link: `https://www.nfse.gov.br/consultapublica`,
          model_id: 30,
          template_id: 30,
          status: "PENDING",
          sequence_num: nextSeq++,
          variables: {
            NOME: firstName,
            CHAVE: item.chaveAcesso,
            VALOR: valorFormatted,
          },
        });

        if (insertErr) {
          results.push({ protocolo: item.protocolo, success: false, error: insertErr.message });
        } else {
          enqueued++;
          results.push({ protocolo: item.protocolo, success: true, phone });
        }
      } catch (err) {
        results.push({ protocolo: item.protocolo, success: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results, enqueued, total: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
