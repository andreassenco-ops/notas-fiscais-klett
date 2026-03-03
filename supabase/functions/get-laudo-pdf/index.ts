// Get Laudo Content - Proxy to Railway Worker
// Routes laudo data request through Railway worker to bypass firewall restrictions
// Now uses dynamic credentials per protocol (login = 01 + protocol, password = senhaSline)
// Requires JWT authentication

import { verifyPatientToken, extractBearerToken } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GetLaudoRequest {
  protocolo: string;
  local?: string;  // Código do local/unidade (ex: "01", "09") - prefixo para login
  senhaSline: string; // password from the database for this protocol
  senhaPortal?: string | null; // optional: senha gerada (DDMMAAAA*9)
}

function normalizeDigits(value: unknown, minLen: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s.padStart(minLen, "0");
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT token
    const jwtSecret = Deno.env.get("PATIENT_JWT_SECRET");
    if (!jwtSecret) {
      console.error("PATIENT_JWT_SECRET not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Configuração de autenticação ausente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = extractBearerToken(req.headers.get("Authorization"));
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de autenticação não fornecido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verification = await verifyPatientToken(token, jwtSecret);
    if (!verification.valid || !verification.payload) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: verification.error === "Token expired" 
            ? "Sessão expirada. Faça login novamente." 
            : "Token inválido" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { protocolo, local, senhaSline, senhaPortal }: GetLaudoRequest = await req.json();

    if (!protocolo || !senhaSline) {
      return new Response(
        JSON.stringify({ success: false, error: "Protocolo e senhaSline são obrigatórios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credenciais do portal (WMI) são DIFERENTES do login do paciente.
    // Formato esperado: login = LOCAL(2 dígitos) + PROTOCOLO(6+ dígitos, com zero à esquerda se necessário)
    // Ex: local=01, protocolo=302080  => 01302080
    // Ex: local=09, protocolo=3950    => 09003950
    const localCode = normalizeDigits(local ?? "01", 2) ?? "01";
    const protocoloCode = normalizeDigits(protocolo, 6);
    if (!protocoloCode) {
      return new Response(
        JSON.stringify({ success: false, error: "Protocolo inválido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loginCodigo = `${localCode}${protocoloCode}`;

    // Senha do portal vem do Autolac (SENHA_SLINE). Normalizar para não perder zeros à esquerda.
    const loginSenhaPrimary = normalizeDigits(senhaSline, 9);
    const loginSenhaFallback = normalizeDigits(senhaPortal, 9);

    if (!loginSenhaPrimary) {
      return new Response(
        JSON.stringify({ success: false, error: "Senha do portal ausente/ inválida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Worker API URL from environment
    const workerApiUrlRaw = Deno.env.get("WORKER_API_URL");

    if (!workerApiUrlRaw) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "URL do Worker não configurada. Configure WORKER_API_URL nas secrets.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize URL
    let workerBaseUrl = workerApiUrlRaw.trim();
    if (!/^https?:\/\//i.test(workerBaseUrl)) {
      workerBaseUrl = `https://${workerBaseUrl}`;
    }

    const workerEndpoint = `${workerBaseUrl.replace(/\/$/, "")}/api/download-laudo`;

    console.log(`[get-laudo-pdf] Proxying to Worker: ${workerEndpoint} (authenticated)`);
    console.log(
      `[get-laudo-pdf] loginCodigo=${loginCodigo} (local=${localCode}, protocolo=${protocoloCode}), senhaLen=${String(loginSenhaPrimary).length}`
    );

    const callWorker = async (senha: string): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);

      try {
        const res = await fetch(workerEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            protocolo: loginCodigo,  // Already formatted as LOCAL+PROTOCOLO (e.g., "093950")
            senhaSline: String(senha),
            targetProtocolo: loginCodigo,  // Same for download
          }),
          signal: controller.signal,
        });
        return res;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let workerResponse: Response;
    try {
      workerResponse = await callWorker(loginSenhaPrimary);
    } catch (fetchError) {
      console.error(`[get-laudo-pdf] Fetch error:`, fetchError);

      const errorMessage =
        fetchError instanceof Error && fetchError.name === "AbortError"
          ? "Timeout: Worker demorou muito para responder"
          : "Erro de conexão com o Worker";

      // evitar status não-2xx no frontend (o SDK transforma em fnError)
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

     // Se o Worker estiver fora do ar, ele pode responder 502/5xx.
     // Não propagar isso para o frontend (vira fnError + blank screen).
      if (!workerResponse.ok) {
        const errorText = await workerResponse.text();
        console.error(`[get-laudo-pdf] Worker error (primary): ${workerResponse.status} - ${errorText}`);

        let errorMessage = "Erro ao conectar com o Worker";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          // ignore parse errors
        }

        const looksLikeAuthFailure =
          typeof errorMessage === "string" &&
          (errorMessage.includes("Autenticação falhou") || errorMessage.includes("authentication"));

        // Retry once with fallback password (DDMMAAAA*9) if provided.
        if (looksLikeAuthFailure && loginSenhaFallback && loginSenhaFallback !== loginSenhaPrimary) {
          console.log(`[get-laudo-pdf] Retrying with fallback portal password (len=${loginSenhaFallback.length})`);
          try {
            const retryResponse = await callWorker(loginSenhaFallback);
            if (retryResponse.ok) {
              return new Response(retryResponse.body, {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            const retryText = await retryResponse.text();
            console.error(`[get-laudo-pdf] Worker error (fallback): ${retryResponse.status} - ${retryText}`);
            try {
              const retryJson = JSON.parse(retryText);
              errorMessage = retryJson.error || retryJson.message || errorMessage;
            } catch {
              // ignore
            }
            return new Response(
              JSON.stringify({
                success: false,
                error: errorMessage,
                upstreamStatus: retryResponse.status,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } catch (retryErr) {
            console.error(`[get-laudo-pdf] Retry fetch error:`, retryErr);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Erro de conexão com o Worker",
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
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

     // Sucesso: repassar o corpo JSON do Worker sem fazer parse aqui (evita overhead/memória)
     return new Response(workerResponse.body, {
       status: 200,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });

  } catch (error) {
    console.error("[get-laudo-pdf] Error:", error);

     // evitar status não-2xx no frontend (o SDK transforma em fnError)
     return new Response(
       JSON.stringify({
         success: false,
         error: error instanceof Error ? error.message : "Erro desconhecido",
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
  }
});
