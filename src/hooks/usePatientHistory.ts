import { useState, useCallback } from "react";
import { generatePdfFromHtml } from "@/lib/pdf-generator";
import { toast } from "sonner";
import { useExamReportEngine } from "./useExamReportEngine";
import { supabase } from "@/integrations/supabase/client";
import { usePatientAuth } from "@/contexts/PatientAuthContext";
import { computePortalPasswordFromBirthDate } from "@/lib/portal-credentials";

export interface PatientData {
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

export interface ProtocolData {
  protocolo: number;
  local: string;  // Código do local/unidade (usado no login do portal)
  data: string;
  convenio: string;
  medico: string;
  exames: string;
  dataEntrega: string;
  resultadoLiberado: boolean;           // Status do Autolac (RESULTADO_LIBERADO = 'T')
  resultadoDisponivelPortal: boolean;   // Status real validado contra o portal WMI
  senhaSline: string | null;
}

interface PatientHistoryResponse {
  success: boolean;
  patient?: PatientData;
  protocols?: ProtocolData[];
  error?: string;
}

// PDF viewer state for RTF-based rendering
interface PdfViewerState {
  isOpen: boolean;
  isLoading: boolean;
  htmlContent: string | null;
  protocolNumber: number | null;
  error: string | null;
  pdfBlob: Blob | null;
  pdfSource: 'local' | 'portal' | null;
}

export function usePatientHistory() {
  const { token, logout } = usePatientAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [protocols, setProtocols] = useState<ProtocolData[]>([]);
  
  // Use the universal report engine
  const reportEngine = useExamReportEngine();
  
  // PDF viewer state
  const [pdfViewer, setPdfViewer] = useState<PdfViewerState>({
    isOpen: false,
    isLoading: false,
    htmlContent: null,
    protocolNumber: null,
    error: null,
    pdfBlob: null,
    pdfSource: null,
  });

  const searchByCpf = async (cpf: string) => {
    setIsLoading(true);
    setError(null);
    setPatient(null);
    setProtocols([]);

    try {
      if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      const { data, error: fnError } = await supabase.functions.invoke<PatientHistoryResponse>(
        "patient-history",
        {
          body: { cpf },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (fnError) {
        throw new Error(fnError.message || "Erro ao buscar dados do paciente");
      }

      if (!data?.success) {
        // Check for session expired error
        if (data?.error?.includes("Sessão expirada") || data?.error?.includes("Token")) {
          logout();
          throw new Error("Sessão expirada. Faça login novamente.");
        }
        throw new Error(data?.error || "Paciente não encontrado");
      }

      setPatient(data.patient || null);
      setProtocols(data.protocols || []);
      
      return { patient: data.patient, protocols: data.protocols };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const clearSearch = () => {
    setPatient(null);
    setProtocols([]);
    setError(null);
  };

  // Download PDF locally using the Universal Report Engine
  const downloadPdfLocal = useCallback(async (protocol: ProtocolData) => {
    console.log("[Patient History] Generating local report for protocol:", protocol.protocolo);

    setPdfViewer(prev => ({
      ...prev,
      isOpen: true,
      isLoading: true,
      protocolNumber: protocol.protocolo,
      error: null,
      htmlContent: null,
      pdfBlob: null,
      pdfSource: 'local',
    }));

    try {
      // Use the universal report engine to generate the report
      const result = await reportEngine.generateReport(
        protocol.protocolo,
        patient?.nome,
        patient?.cpf
      );

      if (!result.success || !result.html) {
        throw new Error(result.error || "Erro ao gerar conteúdo do laudo");
      }

      // Store HTML for preview
      setPdfViewer(prev => ({
        ...prev,
        isLoading: false,
        htmlContent: result.html || null,
      }));

    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar PDF";
      console.error("[Patient History] Local report generation error:", err);
      
      setPdfViewer(prev => ({
        ...prev,
        isLoading: false,
        error: message,
      }));

      toast.error("Erro ao gerar laudo", {
        description: message,
      });
    }
  }, [reportEngine, patient?.nome, patient?.cpf]);

  // Download laudo from portal via Edge Function proxy
  // Now receives Base64 PDF directly from the portal - no local rendering needed
  const downloadPdfFromPortal = useCallback(async (protocol: ProtocolData) => {
    console.log("[Patient History] Fetching official PDF from WMI portal for protocol:", protocol.protocolo);

    setPdfViewer(prev => ({
      ...prev,
      isOpen: true,
      isLoading: true,
      protocolNumber: protocol.protocolo,
      error: null,
      htmlContent: null,
      pdfBlob: null,
      pdfSource: 'portal',
    }));

    try {
      if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      // Use dynamic credentials: local + protocol for login, senhaSline from the protocol data
      const { data, error: fnError } = await supabase.functions.invoke("get-laudo-pdf", {
        body: {
          protocolo: String(protocol.protocolo),
          local: protocol.local || "01",  // Código do local/unidade
          senhaSline: protocol.senhaSline, // password from database
          // Fallback credential: senha = DDMMAAAA * 9 (a partir da data de nascimento)
          senhaPortal: patient?.dataNascimento
            ? computePortalPasswordFromBirthDate(patient.dataNascimento)
            : null,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || "Erro ao buscar laudo do portal");
      }

      // Check if we got a successful response with PDF content
      if (data && typeof data === 'object') {
        const responseData = data as { 
          success?: boolean; 
          error?: string; 
          content?: {
            Base64?: string;
            Validade?: string;
          };
          laudoInfo?: {
            id: number;
            nomePaciente: string;
            percentual: number;
          };
        };

        if (!responseData.success) {
          throw new Error(responseData.error || "Erro desconhecido ao buscar laudo");
        }

        // Check if we have the Base64 PDF
        if (responseData.content?.Base64) {
          console.log("[Patient History] Got official PDF from Klett database!");
          
          // Convert Base64 to Blob
          const byteCharacters = atob(responseData.content.Base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });

          // Store the PDF blob for preview and download
          setPdfViewer(prev => ({
            ...prev,
            isLoading: false,
            pdfBlob: pdfBlob,
            pdfSource: 'portal',
          }));

          toast.success("Resultado carregado com sucesso!");
        } else {
          throw new Error("PDF não encontrado na resposta");
        }
        
      } else {
        throw new Error("Resposta inválida do servidor");
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar laudo do portal";
      console.error("[Patient History] Portal laudo error:", err);
      
      setPdfViewer(prev => ({
        ...prev,
        isLoading: false,
        error: message,
      }));

      toast.error("Erro ao buscar resultado", {
        description: message,
      });
    }
  }, [downloadPdfLocal]);

  // Main downloadPdf function - always try portal first (uses fixed login)
  const downloadPdf = useCallback(async (protocol: ProtocolData) => {
    // Always try portal first with fixed login
    await downloadPdfFromPortal(protocol);
  }, [downloadPdfFromPortal]);

  // Actually download the PDF file
  const triggerPdfDownload = useCallback(async () => {
    if (!pdfViewer.protocolNumber) {
      toast.error("Nenhum laudo carregado para download");
      return;
    }

    // If we have a PDF blob from the portal, download it directly
    if (pdfViewer.pdfBlob) {
      const url = URL.createObjectURL(pdfViewer.pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laudo_${pdfViewer.protocolNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF baixado com sucesso!");
      return;
    }

    // Otherwise, generate PDF from HTML
    if (!pdfViewer.htmlContent) {
      toast.error("Nenhum conteúdo para gerar PDF");
      return;
    }

    setPdfViewer(prev => ({ ...prev, isLoading: true }));

    const result = await generatePdfFromHtml(
      pdfViewer.htmlContent,
      `Laudo_${pdfViewer.protocolNumber}.pdf`
    );

    setPdfViewer(prev => ({ ...prev, isLoading: false }));

    if (!result.success) {
      toast.error("Erro ao gerar PDF", {
        description: result.error,
      });
    } else {
      toast.success("PDF baixado com sucesso!");
    }
  }, [pdfViewer.htmlContent, pdfViewer.protocolNumber, pdfViewer.pdfBlob]);

  // Close PDF viewer
  const closePdfViewer = useCallback(() => {
    setPdfViewer({
      isOpen: false,
      isLoading: false,
      htmlContent: null,
      protocolNumber: null,
      error: null,
      pdfBlob: null,
      pdfSource: null,
    });
    reportEngine.clearReport();
  }, [reportEngine]);

  return {
    isLoading,
    error,
    patient,
    protocols,
    searchByCpf,
    clearSearch,
    downloadPdf,
    downloadPdfFromPortal,
    downloadPdfLocal,
    // PDF viewer state and actions
    pdfViewer,
    closePdfViewer,
    triggerPdfDownload,
  };
}
