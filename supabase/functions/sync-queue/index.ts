// Sync Queue Edge Function
// Triggers sync from SQL Server to send_queue for ALL active models via Worker API

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ModelResult {
  model_id: number;
  model_name: string;
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  skippedReason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const workerApiUrlRaw = Deno.env.get("WORKER_API_URL");

    if (!workerApiUrlRaw) {
      return new Response(
        JSON.stringify({ success: false, error: "WORKER_API_URL não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let workerBaseUrl = workerApiUrlRaw.trim();
    if (!/^https?:\/\//i.test(workerBaseUrl)) {
      workerBaseUrl = `https://${workerBaseUrl}`;
    }

    // Use 'any' to bypass strict type checking with dynamic Supabase client
    const supabase: any = createClient(supabaseUrl, supabaseKey);

    // Optional: allow targeting a specific model via body
    let targetModelId: number | null = null;
    try {
      const body = await req.json();
      if (body?.model_id) targetModelId = Number(body.model_id);
    } catch { /* no body or invalid json, process all */ }

    // Fetch all active models with SQL queries
    let modelsQuery = supabase
      .from("models")
      .select("id, name, sql_query, query_interval_minutes, last_query_at")
      .eq("is_active", true)
      .not("sql_query", "is", null);

    if (targetModelId) {
      modelsQuery = modelsQuery.eq("id", targetModelId);
    }

    const { data: models, error: modelsError } = await modelsQuery;

    if (modelsError || !models || models.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum modelo ativo encontrado", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ModelResult[] = [];

    for (const model of models) {
      // Check if it's time to execute based on query_interval_minutes
      if (model.last_query_at && !targetModelId) {
        const lastQuery = new Date(model.last_query_at);
        const now = new Date();
        const diffMinutes = (now.getTime() - lastQuery.getTime()) / (1000 * 60);
        if (diffMinutes < model.query_interval_minutes) {
          console.log(`⏳ Modelo ${model.id} (${model.name}): próxima execução em ${Math.round(model.query_interval_minutes - diffMinutes)}min`);
          results.push({
            model_id: model.id,
            model_name: model.name,
            total: 0, inserted: 0, skipped: 0, errors: 0,
            skippedReason: `Intervalo não atingido (${Math.round(diffMinutes)}/${model.query_interval_minutes}min)`,
          });
          continue;
        }
      }

      console.log(`🔄 Executando sync para Modelo #${model.id}: ${model.name}`);

      try {
        const modelResult = await syncModel(model, workerBaseUrl, supabase);
        results.push(modelResult);
      } catch (err) {
        console.error(`❌ Erro no Modelo ${model.id}:`, err);
        results.push({
          model_id: model.id,
          model_name: model.name,
          total: 0, inserted: 0, skipped: 0, errors: 1,
          skippedReason: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);

    console.log(`✅ Sync concluído: ${results.length} modelo(s), ${totalInserted} inseridos, ${totalSkipped} ignorados`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Build portal URL from CODIGO, SENHA and CPF
 */
function buildPortalUrl(codigo: string, senha: string, cpf: string): string {
  if (!codigo || !senha || !cpf) return "";
  // Normalize CODIGO: first 2 digits = LOCAL, rest = PROTOCOLO padded to 6 digits
  const localPart = codigo.substring(0, 2);
  const protocoloPart = codigo.substring(2).padStart(6, "0");
  const normalizedCodigo = `${localPart}${protocoloPart}`;
  // Normalize SENHA: pad to 9 digits
  const normalizedSenha = senha.padStart(9, "0");
  const codigoB64 = btoa(normalizedCodigo);
  const senhaB64 = btoa(normalizedSenha);
  const cpfPrefix = cpf.replace(/\D/g, "").substring(0, 4);
  const cpfB64 = btoa(cpfPrefix);
  return `http://app.lifesys.com.br/laudos/#/loginAutolacCPF?codigo=${codigoB64}&senha=${senhaB64}&cpf=${cpfB64}`;
}

/**
 * Format EXAMES text: clean whitespace padding, separate with [[BL]]
 */
function formatExames(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, " ")
    .split(/\s{2,}/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join("[[BL]]");
}

/**
 * Format SIGLAS from SIGLASEXAME: clean up comma-separated to [[BL]]
 */
function formatSiglas(raw: string): string {
  if (!raw) return "";
  return raw
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join("[[BL]]");
}

/**
 * Syncs a single model: executes SQL via worker, inserts new records into send_queue
 */
async function syncModel(
  model: { id: number; name: string; sql_query: string },
  workerBaseUrl: string,
  supabase: any
): Promise<ModelResult> {
  const workerEndpoint = `${workerBaseUrl.replace(/\/$/, "")}/api/test-query`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const workerResponse = await fetch(workerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql_query: model.sql_query, limit: 500, include_total: true }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!workerResponse.ok) {
    const errorText = await workerResponse.text();
    throw new Error(`Worker: ${workerResponse.status} - ${errorText}`);
  }

  const workerData = await workerResponse.json();

  if (!workerData.success || !workerData.rows) {
    throw new Error(workerData.error || "Nenhum dado retornado");
  }

  const rows = workerData.rows as Record<string, unknown>[];
  console.log(`📊 Modelo ${model.id}: ${rows.length} registros do SQL Server`);

  // Get max sequence_num
  const { data: maxSeq } = await supabase
    .from("send_queue")
    .select("sequence_num")
    .order("sequence_num", { ascending: false })
    .limit(1)
    .single();

  let nextSeq = (maxSeq?.sequence_num || 0) + 1;
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const protocol = String(row.PROTOCOLO || row.protocolo || "");
    const cpf = String(row.CPF || row.cpf || "");
    const name = String(row.NOME || row.nome || "");
    const phone = String(row.CELULAR || row.celular || "");
    const codigo = String(row.CODIGO || row.codigo || "");
    const senha = String(row.SENHA || row.senha || "");
    const rawExames = String(row.EXAMES || row.exames || "");
    const rawSiglas = String(row.SIGLAS || row.siglas || "");
    const dataField = row.DATA || row.data;

    if (!protocol || !cpf || !name || !phone) {
      skipped++;
      continue;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      skipped++;
      continue;
    }

    const formattedPhone = phoneDigits.length === 11
      ? `55${phoneDigits}`
      : `559${phoneDigits}`;

    // Build portal URL dynamically
    const url = buildPortalUrl(codigo, senha, cpf);

    let scheduledDate: string;
    if (dataField) {
      const dateObj = new Date(dataField as string);
      scheduledDate = dateObj.toISOString().split("T")[0];
    } else {
      scheduledDate = new Date().toISOString().split("T")[0];
    }

    // Dedup by protocol + cpf + model_id
    const { data: existing } = await supabase
      .from("send_queue")
      .select("id, status, sent_at")
      .eq("protocol", protocol)
      .eq("cpf", cpf)
      .eq("model_id", model.id)
      .limit(1);

    if (existing && existing.length > 0) {
      const existingRecord = existing[0];

      if (existingRecord.status === "ERROR") {
        // Always re-queue errors
        await supabase
          .from("send_queue")
          .update({ status: "PENDING", error_message: null, sent_at: null, attempts: 0 })
          .eq("id", existingRecord.id);
        inserted++;
        console.log(`🔁 Reenvio agendado para protocolo ${protocol} (era ERROR)`);
      } else if (existingRecord.status === "SENT") {
        // Only re-queue if sent on a PREVIOUS day
        const todayDate = new Date().toISOString().split("T")[0];
        const sentDate = existingRecord.sent_at ? existingRecord.sent_at.split("T")[0] : null;
        if (sentDate && sentDate < todayDate) {
          await supabase
            .from("send_queue")
            .update({ status: "PENDING", error_message: null, sent_at: null, attempts: 0 })
            .eq("id", existingRecord.id);
          inserted++;
          console.log(`🔁 Reenvio agendado para protocolo ${protocol} (enviado em ${sentDate})`);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    // Build variables JSON (all columns uppercased + formatted versions)
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      variables[key.toUpperCase()] = String(value ?? "");
    }
    // Add formatted versions
    variables["EXAMES"] = formatExames(rawExames);
    variables["SIGLAS"] = formatSiglas(rawSiglas);
    variables["URL"] = url;
    variables["CODIGO"] = codigo;
    variables["SENHA"] = senha;

    const { error: insertError } = await supabase.from("send_queue").insert({
      protocol,
      cpf,
      patient_name: name,
      phone: formattedPhone,
      result_link: url,
      sequence_num: nextSeq++,
      model_id: model.id,
      variables,
      status: "PENDING",
      scheduled_date: scheduledDate,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        skipped++;
      } else {
        console.error(`Insert error for ${protocol}:`, insertError.message);
        skipped++;
      }
    } else {
      inserted++;
    }
  }

  // Update last_query_at
  await supabase
    .from("models")
    .update({ last_query_at: new Date().toISOString() })
    .eq("id", model.id);

  // Log execution
  await supabase.from("send_logs").insert({
    event: "MODEL_QUERY_EXECUTED",
    details: {
      model_id: model.id,
      model_name: model.name,
      total: rows.length,
      inserted,
      skipped,
      errors: 0,
    },
  });

  console.log(`✅ Modelo ${model.id}: ${inserted} inseridos, ${skipped} ignorados de ${rows.length}`);

  return {
    model_id: model.id,
    model_name: model.name,
    total: rows.length,
    inserted,
    skipped,
    errors: 0,
  };
}
