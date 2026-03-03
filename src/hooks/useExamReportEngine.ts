/**
 * Universal Exam Report Engine Hook
 * 
 * Fetches layout templates from LAYOUT_LAUDOS using VARCHAR-based joins,
 * substitutes tags with real data, and renders the final report as HTML.
 * 
 * IMPORTANT: All IDs are treated as VARCHAR to handle alphanumeric keys
 * like '1.0', '2.0', 'HBA1CALVAR', etc.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutTemplates,
  ExamHeaderData,
  ComponentData,
  buildCompleteReport,
} from "@/lib/rtf-tag-parser";
import { renderExamReport } from "@/lib/rtf-html-renderer";

// ============================================================================
// TYPES
// ============================================================================

interface LayoutWithExamRow {
  SIGLA: string;
  EXAME_NOME: string;
  LAYOUT_ID: string;
  RTF_CABECALHO: string;
  RTF_CORPO: string;
}

interface ExamResultRow {
  NOMECOMPONENTE: string;
  RESULTADO: string;
  UNIDADE: string;
  VALOR_REF: string;
  ORDEM?: number;
}

interface ProtocolExamRow {
  SIGLA: string;
  LAUDO_ID: string;
  DESCRICAO: string;
}

export interface ReportResult {
  success: boolean;
  html?: string;
  error?: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useExamReportEngine() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);

  /**
   * Fetches layout template by joining EXAMES to LAYOUT_LAUDOS using VARCHAR cast
   * This handles alphanumeric IDs like '1.0', '2.0', 'HBA1CALVAR'
   */
  const fetchLayoutForExam = useCallback(async (siglaExame: string): Promise<LayoutTemplates | null> => {
    console.log("[ReportEngine] Fetching layout for exam:", siglaExame);
    
    const { data, error } = await supabase.functions.invoke("test-sql-query", {
      body: {
        sql_query: `
          SELECT TOP 1
            E.SIGLA,
            E.DESCRICAO as EXAME_NOME,
            CAST(L.ID AS VARCHAR(50)) as LAYOUT_ID,
            CAST(L.DADOS_EXAME AS VARCHAR(MAX)) as RTF_CABECALHO,
            CAST(L.DADOS_COMPONENTE AS VARCHAR(MAX)) as RTF_CORPO
          FROM EXAMES E
          INNER JOIN LAYOUT_LAUDOS L ON CAST(E.LAUDO AS VARCHAR(50)) = CAST(L.ID AS VARCHAR(50))
          WHERE E.SIGLA = '${siglaExame.replace(/'/g, "''")}'
        `,
        limit: 1,
      },
    });

    if (error) {
      console.error("[ReportEngine] Supabase function error:", error);
      return null;
    }

    if (!data?.success || !data?.rows?.length) {
      console.warn("[ReportEngine] No layout found for exam:", siglaExame);
      return null;
    }

    const row = data.rows[0] as LayoutWithExamRow;
    console.log("[ReportEngine] Layout loaded for", row.EXAME_NOME, "- Layout ID:", row.LAYOUT_ID);
    
    return {
      dadosExame: row.RTF_CABECALHO || "",
      dadosComponente: row.RTF_CORPO || "",
    };
  }, []);

  /**
   * Fetches all exam siglas for a protocol to get their layouts
   * Uses TOP + subquery instead of DISTINCT to avoid SQL Server issues
   */
  const fetchProtocolExams = useCallback(async (protocolo: number): Promise<string[]> => {
    console.log("[ReportEngine] Fetching exam list for protocol:", protocolo);
    
    const { data, error } = await supabase.functions.invoke("test-sql-query", {
      body: {
        sql_query: `
          SELECT TOP 50
            E.SIGLA,
            CAST(E.LAUDO AS VARCHAR(50)) as LAUDO_ID,
            E.DESCRICAO
          FROM EXAMES E
          WHERE E.ID IN (
            SELECT R.EXANE FROM RESULTADOS R WHERE R.PROTOCOLO = ${protocolo}
          )
          GROUP BY E.SIGLA, E.LAUDO, E.DESCRICAO
        `,
        limit: 100,
      },
    });

    if (error || !data?.success) {
      console.error("[ReportEngine] Error fetching exam list:", error || data?.error);
      return [];
    }

    const rows = (data.rows || []) as ProtocolExamRow[];
    const siglas = rows.map(r => r.SIGLA).filter(Boolean);
    console.log("[ReportEngine] Found exams:", siglas.join(", "));
    
    return siglas;
  }, []);

  /**
   * Fetches exam results for a specific protocol
   * Results are ordered to map to R001, R002, etc. tags
   */
  const fetchExamResults = useCallback(async (protocolo: number): Promise<ComponentData[] | null> => {
    console.log("[ReportEngine] Fetching exam results for protocol:", protocolo);
    
    const { data, error } = await supabase.functions.invoke("test-sql-query", {
      body: {
        sql_query: `
          SELECT 
            E.DESCRICAO as NOMECOMPONENTE,
            R.RESULTADO,
            E.UNIDADE,
            ISNULL(CAST(E.VALORPADRAO AS VARCHAR(MAX)), '') as VALOR_REF,
            ROW_NUMBER() OVER (ORDER BY E.ID) as ORDEM
          FROM RESULTADOS R
          INNER JOIN EXAMES E ON R.EXANE = E.ID
          WHERE R.PROTOCOLO = ${protocolo}
          ORDER BY E.DESCRICAO
        `,
        limit: 500,
      },
    });

    if (error) {
      console.error("[ReportEngine] Supabase function error:", error);
      return null;
    }

    if (!data?.success) {
      console.error("[ReportEngine] Query failed:", data?.error);
      return null;
    }

    const rows = (data.rows || []) as ExamResultRow[];
    console.log("[ReportEngine] Fetched", rows.length, "exam results");

    // Convert to ComponentData format with order for R001, R002 mapping
    const components: ComponentData[] = rows.map((row, index) => ({
      nomeComponente: row.NOMECOMPONENTE || "",
      resultado: row.RESULTADO || "",
      unidade: row.UNIDADE || "",
      valorRef: row.VALOR_REF || "",
      // Store order for potential R00X mapping
      _order: row.ORDEM || index + 1,
    } as ComponentData & { _order: number }));

    return components;
  }, []);

  /**
   * Fetches historical results for a patient (previous exams of same type)
   */
  const fetchHistoricalResults = useCallback(async (
    cpf: string,
    siglaExame: string,
    currentProtocolo: number,
    limit: number = 8
  ): Promise<Array<{ data: string; resultado: string }>> => {
    console.log("[ReportEngine] Fetching historical results for:", siglaExame);
    
    const { data, error } = await supabase.functions.invoke("test-sql-query", {
      body: {
        sql_query: `
          SELECT TOP ${limit}
            CONVERT(VARCHAR(10), REQ.DATA, 103) as DATA_EXAME,
            R.RESULTADO
          FROM RESULTADOS R
          INNER JOIN REQUISICAO REQ ON R.PROTOCOLO = REQ.PROTOCOLO
          INNER JOIN PACIENTE P ON REQ.PACIENTE = P.ID
          INNER JOIN EXAMES E ON R.EXANE = E.ID
          WHERE REPLACE(REPLACE(P.CPF, '.', ''), '-', '') = '${cpf.replace(/\D/g, '')}'
            AND E.SIGLA = '${siglaExame.replace(/'/g, "''")}'
            AND R.PROTOCOLO != ${currentProtocolo}
          ORDER BY REQ.DATA DESC
        `,
        limit: limit,
      },
    });

    if (error || !data?.success) {
      console.warn("[ReportEngine] Could not fetch historical results:", error || data?.error);
      return [];
    }

    return (data.rows || []).map((r: { DATA_EXAME: string; RESULTADO: string }) => ({
      data: r.DATA_EXAME || "",
      resultado: r.RESULTADO || "",
    }));
  }, []);

  /**
   * Main function: generates a complete exam report for a protocol
   */
  const generateReport = useCallback(async (
    protocolo: number,
    patientName?: string,
    patientCpf?: string
  ): Promise<ReportResult> => {
    setIsLoading(true);
    setError(null);
    setRenderedHtml(null);

    try {
      console.log("[ReportEngine] Starting report generation for protocol:", protocolo);

      // 1. Fetch exam results
      const components = await fetchExamResults(protocolo);
      
      if (!components || components.length === 0) {
        throw new Error("Nenhum resultado de exame encontrado para este protocolo");
      }

      // 2. Get list of exams in this protocol to fetch their layouts
      const examSiglas = await fetchProtocolExams(protocolo);
      
      // 3. Try to fetch layout for the first exam (primary layout)
      let templates: LayoutTemplates | null = null;
      if (examSiglas.length > 0) {
        templates = await fetchLayoutForExam(examSiglas[0]);
      }

      // 4. Build the report
      const currentDate = new Date().toLocaleDateString('pt-BR');
      const headerData: ExamHeaderData = {
        nomeExame: examSiglas.join(", ") || `Protocolo ${protocolo}`,
        dataColeta: currentDate,
        metodo: "Automatizado",
        material: "Sangue",
      };

      let html: string;

      if (templates && templates.dadosExame && templates.dadosComponente) {
        console.log("[ReportEngine] Using RTF template rendering");
        
        // Build RTF document from templates
        const rtfContent = buildCompleteReport(templates, headerData, components);
        
        // Render to HTML (with fallback)
        html = await renderExamReport(
          rtfContent,
          protocolo,
          components,
          patientName,
          currentDate
        );
      } else {
        console.log("[ReportEngine] No templates found, using fallback HTML rendering");
        
        // Use fallback HTML rendering
        html = await renderExamReport(
          null,
          protocolo,
          components,
          patientName,
          currentDate
        );
      }

      setRenderedHtml(html);
      console.log("[ReportEngine] Report generated successfully");
      
      return { success: true, html };

    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido ao gerar laudo";
      console.error("[ReportEngine] Error generating report:", err);
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchExamResults, fetchProtocolExams, fetchLayoutForExam]);

  /**
   * Clears the current report state
   */
  const clearReport = useCallback(() => {
    setRenderedHtml(null);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    renderedHtml,
    generateReport,
    clearReport,
    // Expose individual fetchers for debugging
    fetchLayoutForExam,
    fetchProtocolExams,
    fetchHistoricalResults,
  };
}
