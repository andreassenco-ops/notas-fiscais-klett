import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let workerUrl = Deno.env.get("WORKER_API_URL");
    
    if (!workerUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "WORKER_API_URL não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Garantir que a URL tem protocolo
    if (!workerUrl.startsWith("http://") && !workerUrl.startsWith("https://")) {
      workerUrl = `https://${workerUrl}`;
    }
    
    // Remover trailing slash se existir
    workerUrl = workerUrl.replace(/\/+$/, "");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Helper function para fetch com timeout
    const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 8000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    if (action === "health") {
      // Testar conexão com o worker
      try {
        const response = await fetchWithTimeout(`${workerUrl}/health`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        
        if (response.ok) {
          const result = await response.json();
          return new Response(
            JSON.stringify({ success: true, worker: result }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          const text = await response.text();
          return new Response(
            JSON.stringify({ success: false, error: `Worker respondeu com erro: ${text}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const isTimeout = errorMsg.includes("abort");
        return new Response(
          JSON.stringify({ success: false, error: isTimeout ? "Worker timeout (8s)" : `Não foi possível conectar ao worker: ${errorMsg}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "start") {
      // Iniciar conexão WhatsApp
      try {
        const response = await fetchWithTimeout(`${workerUrl}/api/whatsapp/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }, 15000); // 15s para start (pode demorar mais)
        
        const result = await response.json();
        
        return new Response(
          JSON.stringify(result),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const isTimeout = errorMsg.includes("abort");
        return new Response(
          JSON.stringify({ success: false, error: isTimeout ? "Worker timeout ao iniciar (15s)" : `Erro ao iniciar: ${errorMsg}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "status") {
      // Verificar status real da conexão WhatsApp
      try {
        const response = await fetchWithTimeout(`${workerUrl}/api/whatsapp/status`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const result = await response.json();

        return new Response(
          JSON.stringify(result),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const isTimeout = errorMsg.includes("abort");
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: isTimeout ? "Worker timeout (8s)" : `Não foi possível verificar status: ${errorMsg}`,
            dbStatus: "UNKNOWN"
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "stop") {
      // Parar conexão WhatsApp
      try {
        const response = await fetchWithTimeout(`${workerUrl}/api/whatsapp/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        const result = await response.json();
        
        return new Response(
          JSON.stringify(result),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const isTimeout = errorMsg.includes("abort");
        return new Response(
          JSON.stringify({ success: false, error: isTimeout ? "Worker timeout ao parar (8s)" : `Não foi possível desconectar: ${errorMsg}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "send") {
      // Enviar mensagem manual
      try {
        const body = await req.json();
        const { phone, message } = body;

        if (!phone || !message) {
          return new Response(
            JSON.stringify({ success: false, error: "phone e message são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const response = await fetchWithTimeout(`${workerUrl}/api/whatsapp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, message }),
        }, 30000); // 30s para envio (pode demorar)
        
        const result = await response.json();
        
        return new Response(
          JSON.stringify(result),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const isTimeout = errorMsg.includes("abort");
        return new Response(
          JSON.stringify({ success: false, error: isTimeout ? "Worker timeout ao enviar (30s)" : `Erro ao enviar mensagem: ${errorMsg}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida. Use ?action=health, ?action=start, ?action=status, ?action=stop ou ?action=send" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
