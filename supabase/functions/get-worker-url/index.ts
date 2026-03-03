import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const workerUrl = Deno.env.get("WORKER_API_URL");

  if (!workerUrl) {
    return new Response(
      JSON.stringify({ error: "WORKER_API_URL não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ url: workerUrl.replace(/\/+$/, "") }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
