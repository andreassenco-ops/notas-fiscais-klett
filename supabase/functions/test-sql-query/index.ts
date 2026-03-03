// Test SQL Query Edge Function
// Proxies requests to the Railway Worker which has SQL Server connectivity

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TestQueryRequest {
  sql_query: string;
  limit?: number;
  include_total?: boolean;
}

interface TestQueryResponse {
  success: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
  executionTime?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sql_query, limit = 10, include_total = true }: TestQueryRequest = await req.json();

    // Validate query
    if (!sql_query || typeof sql_query !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Consulta SQL é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmed = sql_query.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT")) {
      return new Response(
        JSON.stringify({ success: false, error: "Apenas consultas SELECT são permitidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for dangerous DDL/DML statements (not functions like CAST, CONVERT)
    const dangerousPatterns = [
      /\bDROP\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION)/i,
      /\bDELETE\s+FROM/i,
      /\bTRUNCATE\s+TABLE/i,
      /\bINSERT\s+INTO/i,
      /\bUPDATE\s+\w+\s+SET/i,
      /\bALTER\s+(TABLE|DATABASE)/i,
      /\bCREATE\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION)/i,
      /\bEXEC\s+\(/i,
      /\bEXECUTE\s+\(/i,
      /\bxp_/i,
      /\bsp_/i,
      /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC)/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql_query)) {
        return new Response(
          JSON.stringify({ success: false, error: "Consulta contém comandos DDL/DML não permitidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Worker API URL from environment
    const workerApiUrlRaw = Deno.env.get("WORKER_API_URL");

    if (!workerApiUrlRaw) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Worker não configurado (WORKER_API_URL ausente).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize URL (accept values like "lab-results....up.railway.app" and add https://)
    let workerBaseUrl = workerApiUrlRaw.trim();
    if (!/^https?:\/\//i.test(workerBaseUrl)) {
      workerBaseUrl = `https://${workerBaseUrl}`;
    }

    // Validate URL early to return a clearer error
    try {
      // eslint-disable-next-line no-new
      new URL(workerBaseUrl);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "WORKER_API_URL inválida. Use um domínio completo, ex: https://seu-app.up.railway.app",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Proxy the request to the Worker
    const workerEndpoint = `${workerBaseUrl.replace(/\/$/, "")}/api/test-query`;

    console.log(`Proxying request to Worker: ${workerEndpoint}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

    let workerResponse: Response;
    try {
      workerResponse = await fetch(workerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql_query, limit, include_total }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      const errorMessage =
        fetchError instanceof Error && fetchError.name === "AbortError"
          ? "Timeout: Worker demorou muito para responder"
          : "Erro ao conectar com o Worker";

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeoutId);

    // IMPORTANT: nunca propagar status 502/5xx do Worker para o frontend, pois o SDK trata como erro (fnError)
    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`Worker error: ${workerResponse.status} - ${errorText}`);

      let errorMessage = "Erro ao conectar com o Worker";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        // ignore parse errors
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          upstreamStatus: workerResponse.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sucesso: repassar JSON do Worker
    const workerData = await workerResponse.json();
    return new Response(JSON.stringify(workerData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error testing query:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      // evitar fnError no frontend (blank screen) por status não-2xx
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
