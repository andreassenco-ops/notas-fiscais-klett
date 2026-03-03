import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildExamReport,
  renderRtfToHtml,
  ExamData,
  ComponentData,
  LayoutTemplates,
  SolicitacaoData,
} from "@/lib/rtf-renderer";

export interface ExamReportResult {
  success: boolean;
  html?: string;
  error?: string;
}

interface LayoutLaudosRow {
  ID: number;
  DESCRICAO: string;
  DADOS_EXAME: string;
  DADOS_COMPONENTE: string;
  DADOS_SOLICITACAO: string | null;
}

interface ExamComponentRow {
  DESCRICAO: string;
  RESULTADO: string;
  UNIDADE: string;
  VALORPADRAO: string;
}

interface ExamMetadataRow {
  LAUDO_ID: number;
  NOMEEXAME: string;
  DATACOLETA: string;
  METODO: string;
  MATERIAL: string;
}

export function useExamReport() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);

  /**
   * Fetches the layout template from LAYOUT_LAUDOS table
   */
  const fetchLayoutTemplate = useCallback(async (layoutId: number): Promise<LayoutTemplates | null> => {
    const { data, error } = await supabase.functions.invoke("test-sql-query", {
      body: {
        sql_query: `
          SELECT 
            ID,
            DESCRICAO,
            DADOS_EXAME,
            DADOS_COMPONENTE,
            DADOS_SOLICITACAO
          FROM LAYOUT_LAUDOS 
          WHERE ID = ${layoutId}
        `,
        limit: 1,
      },
    });

    if (error || !data?.success || !data?.rows?.length) {
      console.error("[useExamReport] Error fetching layout:", error || data?.error);
      return null;
    }

    const row = data.rows[0] as LayoutLaudosRow;
    return {
      dadosExame: row.DADOS_EXAME || "",
      dadosComponente: row.DADOS_COMPONENTE || "",
      dadosSolicitacao: row.DADOS_SOLICITACAO || undefined,
    };
  }, []);

  /**
   * Fetches exam components and results for a specific protocol/exam
   */
  const fetchExamResults = useCallback(async (
    protocolo: string,
    examId: string
  ): Promise<{ examData: ExamData; components: ComponentData[] } | null> => {
    // Fetch exam metadata and components
    const { data, error } = await supabase.functions.invoke("test-sql-query", {
      body: {
        sql_query: `
          SELECT 
            e.DESCRICAO as NOMECOMPONENTE,
            e.RESULTADO,
            e.UNIDADE,
            e.VALORPADRAO as VALOR_REF
          FROM EXAMES e
          WHERE e.LAUDO = '${examId}'
          ORDER BY e.ID
        `,
        limit: 100,
      },
    });

    if (error || !data?.success) {
      console.error("[useExamReport] Error fetching exam results:", error || data?.error);
      return null;
    }

    const rows = data.rows as ExamComponentRow[];
    
    // Build component data
    const components: ComponentData[] = rows.map((row) => ({
      nomeComponente: row.DESCRICAO || "",
      resultado: row.RESULTADO || "",
      unidade: row.UNIDADE || "",
      valorRef: row.VALORPADRAO || "",
    }));

    // Placeholder exam data - this would come from a separate query
    const examData: ExamData = {
      nomeExame: examId,
      dataColeta: new Date().toLocaleDateString("pt-BR"),
      metodo: "Automatizado",
      material: "Sangue",
    };

    return { examData, components };
  }, []);

  /**
   * Generates a complete exam report using RTF templates
   */
  const generateReport = useCallback(async (
    protocolo: string,
    examId: string,
    layoutId: number = 1, // Default to layout 1
    solicitacao?: SolicitacaoData
  ): Promise<ExamReportResult> => {
    setIsLoading(true);
    setError(null);
    setRenderedHtml(null);

    try {
      // 1. Fetch the layout template
      const templates = await fetchLayoutTemplate(layoutId);
      if (!templates) {
        throw new Error("Layout template not found");
      }

      // 2. Fetch exam data and components
      const examResults = await fetchExamResults(protocolo, examId);
      if (!examResults) {
        throw new Error("Exam results not found");
      }

      // 3. Build the complete RTF document
      const rtfContent = buildExamReport(
        templates,
        examResults.examData,
        examResults.components,
        solicitacao
      );

      console.log("[useExamReport] Generated RTF document, rendering to HTML...");

      // 4. Render RTF to HTML
      const html = await renderRtfToHtml(rtfContent);
      setRenderedHtml(html);

      return { success: true, html };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[useExamReport] Error generating report:", err);
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchLayoutTemplate, fetchExamResults]);

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
  };
}
