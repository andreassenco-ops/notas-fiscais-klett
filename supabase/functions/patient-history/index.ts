// Patient History Edge Function
// Queries Autolac database for patient history by CPF
// Validates result availability against WMI portal for accuracy
// Requires JWT authentication

import { verifyPatientToken, extractBearerToken } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PatientData {
  id: number;
  nome: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  celular: string;
  email: string;
  nomeMae: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface ProtocolData {
  protocolo: number;
  local: string;  // Código do local/unidade (usado no login do portal)
  data: string;
  convenio: string;
  medico: string;
  exames: string;
  dataEntrega: string;
  resultadoLiberado: boolean;      // Status do Autolac (RESULTADO_LIBERADO = 'T')
  resultadoDisponivelPortal: boolean; // Status real validado contra o portal
  senhaSline: string | null;
}

interface PatientHistoryResponse {
  success: boolean;
  patient?: PatientData;
  protocols?: ProtocolData[];
  validationTimeMs?: number;  // Tempo gasto na validação do portal
  error?: string;
}

// Helper to normalize digits with padding
function normalizeDigits(value: unknown, minLen: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s.padStart(minLen, "0");
  return s;
}

// Check if a protocol's result is actually available on the portal
async function checkPortalAvailability(
  workerBaseUrl: string,
  protocolo: number,
  local: string,
  senhaSline: string
): Promise<{ available: boolean; timeMs: number }> {
  const startTime = Date.now();
  
  try {
    const localCode = normalizeDigits(local, 2) ?? "01";
    const protocoloCode = normalizeDigits(protocolo, 6);
    if (!protocoloCode) return { available: false, timeMs: Date.now() - startTime };
    
    const loginCodigo = `${localCode}${protocoloCode}`;
    const senha = normalizeDigits(senhaSline, 9);
    if (!senha) return { available: false, timeMs: Date.now() - startTime };
    
    const workerEndpoint = `${workerBaseUrl.replace(/\/$/, "")}/api/download-laudo`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per check
    
    try {
      const response = await fetch(workerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocolo: loginCodigo,
          senhaSline: String(senha),
          targetProtocolo: loginCodigo,
          checkOnly: true, // Signal to worker to do a quick check (if supported)
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return { available: false, timeMs: Date.now() - startTime };
      }
      
      const data = await response.json();
      const available = data.success === true && data.content?.Base64;
      
      return { available: Boolean(available), timeMs: Date.now() - startTime };
    } catch {
      clearTimeout(timeoutId);
      return { available: false, timeMs: Date.now() - startTime };
    }
  } catch {
    return { available: false, timeMs: Date.now() - startTime };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT token
    const jwtSecret = Deno.env.get("PATIENT_JWT_SECRET");
    if (!jwtSecret) {
      console.error("PATIENT_JWT_SECRET not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Configuração de autenticação ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = extractBearerToken(req.headers.get("Authorization"));
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de autenticação não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get CPF from token (patient can only see their own data)
    const patientCpf = verification.payload.cpf;
    const cleanCpf = patientCpf.replace(/\D/g, "");

    // Build the SQL query for patient history (Autolac SQL Server)
    // Uses subquery approach instead of CTE (WITH) because the worker validator only accepts SELECT
    const sqlQuery = `
      SELECT
        P.ID AS PacienteID,
        P.NOME AS Paciente,
        P.CPF,
        P.DATANASCIMENTO AS DataNascimento,
        P.SEXO,
        P.CELULAR,
        P.EMAIL,
        P.NOME_MAE AS NomeMae,
        P.ENDERECO,
        P.BAIRRO,
        P.CIDADE,
        P.ESTADO,
        R.PROTOCOLO,
        R.LOCAL,
        R.DATA AS DataAtendimento,
        R.CONVENIO,
        R.MEDICO,
        R.EXAMES AS ListaExames,
        R.DATAENTREGA,
        R.RESULTADO_LIBERADO,
        COALESCE(
          (SELECT TOP 1 R2.SENHA_SLINE 
           FROM REQUISICAO R2 
           WHERE R2.PROTOCOLO = R.PROTOCOLO 
             AND R2.PACIENTE = R.PACIENTE
             AND R2.SENHA_SLINE IS NOT NULL 
             AND LEN(R2.SENHA_SLINE) > 0 
           ORDER BY LEN(R2.SENHA_SLINE) DESC),
          R.SENHA_SLINE
        ) AS SENHA_SLINE
      FROM PACIENTE P
      INNER JOIN REQUISICAO R ON R.PACIENTE = P.ID
      WHERE REPLACE(REPLACE(P.CPF, '.', ''), '-', '') = '${cleanCpf}'
      ORDER BY R.DATA DESC
    `;

    // Get Worker API URL from environment
    const workerApiUrlRaw = Deno.env.get("WORKER_API_URL");

    if (!workerApiUrlRaw) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "URL do Worker não configurada. Configure WORKER_API_URL nas secrets.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize URL
    let workerBaseUrl = workerApiUrlRaw.trim();
    if (!/^https?:\/\//i.test(workerBaseUrl)) {
      workerBaseUrl = `https://${workerBaseUrl}`;
    }

    // Validate URL
    try {
      new URL(workerBaseUrl);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "WORKER_API_URL inválida",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Proxy the request to the Worker
    const workerEndpoint = `${workerBaseUrl.replace(/\/$/, "")}/api/test-query`;

    console.log(`Fetching patient history for CPF: ${cleanCpf.substring(0, 3)}*** (authenticated)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let workerResponse: Response;
    try {
      workerResponse = await fetch(workerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql_query: sqlQuery, limit: 100, include_total: false }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`Fetch error: ${fetchError}`);
      
      const errorMessage = fetchError instanceof Error && fetchError.name === "AbortError"
        ? "Timeout: Worker demorou muito para responder"
        : "Erro de conexão com o Worker";
      
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeoutId);

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`Worker error: ${workerResponse.status} - ${errorText}`);
      
      let errorDetail = "Erro ao consultar dados do paciente";
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorDetail = errorJson.error;
        }
      } catch {
        // Keep default message
      }
      
      return new Response(
        JSON.stringify({ success: false, error: errorDetail }),
        { status: workerResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const workerData = await workerResponse.json();

    if (!workerData.success || !workerData.rows || workerData.rows.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Paciente não encontrado com este CPF" 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract patient data from first row
    const firstRow = workerData.rows[0];
    const patient: PatientData = {
      id: firstRow.PacienteID || firstRow.ID,
      nome: firstRow.Paciente || firstRow.NOME,
      cpf: firstRow.CPF,
      dataNascimento: firstRow.DataNascimento || firstRow.DATANASCIMENTO,
      sexo: firstRow.SEXO,
      celular: firstRow.CELULAR,
      email: firstRow.EMAIL,
      nomeMae: firstRow.NomeMae || firstRow.NOME_MAE,
      endereco: firstRow.ENDERECO || "",
      bairro: firstRow.BAIRRO || "",
      cidade: firstRow.CIDADE || "",
      estado: firstRow.ESTADO || "",
    };

    // Extract protocols (initial pass - without portal validation)
    const protocolsRaw: Array<{
      protocolo: number;
      local: string;
      data: string;
      convenio: string;
      medico: string;
      exames: string;
      dataEntrega: string;
      resultadoLiberado: boolean;
      senhaSline: string | null;
    }> = workerData.rows.map((row: Record<string, unknown>) => {
      const localRaw = row.LOCAL ?? "01";
      const localStr = String(localRaw);
      const local = /^\d+$/.test(localStr) ? localStr.padStart(2, "0") : localStr;

      const senhaRaw = row.SENHA_SLINE as unknown;
      const senhaStr = senhaRaw === null || senhaRaw === undefined ? null : String(senhaRaw);
      const senhaSline =
        senhaStr && /^\d+$/.test(senhaStr) ? senhaStr.padStart(9, "0") : senhaStr;

      return {
        protocolo: row.PROTOCOLO as number,
        local, // Código do local/unidade (2 dígitos)
        data: (row.DataAtendimento || row.DATA) as string,
        convenio: row.CONVENIO as string,
        medico: row.MEDICO as string,
        exames: (row.ListaExames || row.EXAMES || "") as string,
        dataEntrega: row.DATAENTREGA as string,
        resultadoLiberado: row.RESULTADO_LIBERADO === "T",
        senhaSline: senhaSline as string | null,
      };
    });

    // Validate portal availability for protocols marked as released with valid credentials
    const validationStartTime = Date.now();
    const protocolsToValidate = protocolsRaw.filter(
      p => p.resultadoLiberado && p.senhaSline && p.senhaSline.length > 0
    );

    console.log(`[patient-history] Validating ${protocolsToValidate.length} protocols against portal...`);

    // Run validation in parallel (max 5 concurrent to avoid overwhelming the portal)
    const validationResults = new Map<number, boolean>();
    
    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < protocolsToValidate.length; i += batchSize) {
      const batch = protocolsToValidate.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (p) => {
          const result = await checkPortalAvailability(
            workerBaseUrl,
            p.protocolo,
            p.local,
            p.senhaSline!
          );
          console.log(`[patient-history] Protocol ${p.protocolo}: available=${result.available}, time=${result.timeMs}ms`);
          return { protocolo: p.protocolo, available: result.available };
        })
      );
      
      for (const r of batchResults) {
        validationResults.set(r.protocolo, r.available);
      }
    }

    const validationTimeMs = Date.now() - validationStartTime;
    console.log(`[patient-history] Portal validation completed in ${validationTimeMs}ms`);

    // Build final protocols with validated status
    const protocols: ProtocolData[] = protocolsRaw.map(p => ({
      ...p,
      resultadoDisponivelPortal: validationResults.get(p.protocolo) ?? false,
    }));

    const response: PatientHistoryResponse = {
      success: true,
      patient,
      protocols,
      validationTimeMs,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error fetching patient history:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
