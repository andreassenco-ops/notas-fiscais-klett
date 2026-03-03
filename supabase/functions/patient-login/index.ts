// Patient Login Edge Function
// Validates login using CPF and password (birth date × 9)
// Returns a JWT token for secure session management

import { createPatientToken } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoginRequest {
  cpf: string;
  password: string;
}

interface PatientBasicData {
  id: number;
  nome: string;
  cpf: string;
  dataNascimento: string;
  celular: string;
  email: string;
}

interface LoginResponse {
  success: boolean;
  patient?: PatientBasicData;
  token?: string;
  error?: string;
}

/**
 * Calculate expected password from birth date
 * Birth date format: DDMMYYYY (e.g., 09041986)
 * Password = DDMMYYYY × 9
 */
function calculatePasswordFromBirthDate(birthDateStr: string): string | null {
  if (!birthDateStr) return null;
  
  try {
    // Extract date part (YYYY-MM-DD) from ISO string
    const dateOnly = birthDateStr.split("T")[0]; // "1986-04-09"
    const [year, month, day] = dateOnly.split("-");
    
    if (!year || !month || !day) return null;
    
    // Format as DDMMYYYY
    const ddmmyyyy = `${day}${month}${year}`;
    const numericDate = parseInt(ddmmyyyy, 10);
    
    if (isNaN(numericDate)) return null;
    
    // Multiply by 9
    const password = numericDate * 9;
    return password.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf, password }: LoginRequest = await req.json();

    // Validate inputs
    if (!cpf || typeof cpf !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "CPF é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || typeof password !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Senha é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean CPF - keep only digits
    const cleanCpf = cpf.replace(/\D/g, "");

    if (cleanCpf.length !== 11) {
      return new Response(
        JSON.stringify({ success: false, error: "CPF deve conter 11 dígitos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query to get patient data with birth date
    const sqlQuery = `
      SELECT TOP 1
        P.ID AS PacienteID,
        P.NOME AS Nome,
        P.CPF,
        P.DATANASCIMENTO AS DataNascimento,
        P.CELULAR,
        P.EMAIL
      FROM PACIENTE P
      WHERE REPLACE(REPLACE(P.CPF, '.', ''), '-', '') = '${cleanCpf}'
    `;

    // Get Worker API URL from environment
    const workerApiUrlRaw = Deno.env.get("WORKER_API_URL");

    if (!workerApiUrlRaw) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "URL do Worker não configurada",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize URL
    let workerBaseUrl = workerApiUrlRaw.trim();
    const httpPattern = /^https?:\/\//i;
    if (!httpPattern.test(workerBaseUrl)) {
      workerBaseUrl = `https://${workerBaseUrl}`;
    }

    // Proxy the request to the Worker
    const workerEndpoint = `${workerBaseUrl.replace(/\/$/, "")}/api/test-query`;

    console.log(`Login attempt for CPF: ${cleanCpf.substring(0, 3)}***`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let workerResponse: Response;
    try {
      workerResponse = await fetch(workerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql_query: sqlQuery, limit: 1, include_total: false }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`Fetch error: ${fetchError}`);
      
      return new Response(
        JSON.stringify({ success: false, error: "Erro de conexão com o servidor" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeoutId);

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`Worker error: ${workerResponse.status} - ${errorText}`);
      
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao consultar dados" }),
        { status: workerResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const workerData = await workerResponse.json();

    if (!workerData.success || !workerData.rows || workerData.rows.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "CPF não encontrado" 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const row = workerData.rows[0];
    const birthDate = row.DataNascimento || row.DATANASCIMENTO;
    
    // Calculate expected password
    const expectedPassword = calculatePasswordFromBirthDate(birthDate);
    
    if (!expectedPassword) {
      console.error("Could not calculate password from birth date");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Erro ao validar credenciais" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password
    if (password !== expectedPassword) {
      console.log(`Password mismatch for CPF: ${cleanCpf.substring(0, 3)}***`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Senha incorreta" 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Login successful - build patient data
    const patient: PatientBasicData = {
      id: row.PacienteID || row.ID,
      nome: row.Nome || row.NOME,
      cpf: row.CPF,
      dataNascimento: birthDate,
      celular: row.CELULAR || "",
      email: row.EMAIL || "",
    };

    // Generate JWT token
    const jwtSecret = Deno.env.get("PATIENT_JWT_SECRET");
    if (!jwtSecret) {
      console.error("PATIENT_JWT_SECRET not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Configuração de autenticação ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await createPatientToken(
      patient.id,
      patient.cpf,
      patient.nome,
      jwtSecret,
      86400 * 7 // 7 days
    );

    console.log(`Login successful for patient ID: ${patient.id}`);

    const response: LoginResponse = {
      success: true,
      patient,
      token,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
