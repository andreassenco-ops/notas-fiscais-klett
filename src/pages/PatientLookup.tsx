import { useState, useEffect } from "react";
import {
  User,
  Calendar,
  Phone,
  Mail,
  FileText,
  FileDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PdfViewerDialog } from "@/components/patient/PdfViewerDialog";
import { usePatientHistory, PatientData, ProtocolData } from "@/hooks/usePatientHistory";
import { usePatientAuth } from "@/contexts/PatientAuthContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(phone: string): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
    // The API returns dates like "1986-04-09T00:00:00.000Z" which is UTC midnight
    // We want to display 09/04/1986, not convert to local timezone
    const dateOnly = dateStr.split("T")[0]; // "1986-04-09"
    const [year, month, day] = dateOnly.split("-");
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
    // Fallback to parseISO if format is different
    const date = parseISO(dateStr);
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

function PatientHeader({ patient }: { patient: PatientData }) {
  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-2xl truncate">{patient.nome}</CardTitle>
              <CardDescription className="text-sm sm:text-base mt-0.5 sm:mt-1">
                CPF: {formatCPF(patient.cpf)}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs sm:text-sm w-fit">
            ID: {patient.id}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground">Nascimento</p>
              <p className="font-medium text-sm sm:text-base">{formatDate(patient.dataNascimento)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <User className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground">Sexo</p>
              <p className="font-medium text-sm sm:text-base">{patient.sexo || "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground">Celular</p>
              <p className="font-medium text-sm sm:text-base truncate">{formatPhone(patient.celular)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground">Email</p>
              <p className="font-medium text-sm sm:text-base truncate" title={patient.email}>
                {patient.email || "-"}
              </p>
            </div>
          </div>
        </div>
        {patient.nomeMae && (
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
            <p className="text-xs sm:text-sm text-muted-foreground">Nome da Mãe</p>
            <p className="font-medium text-sm sm:text-base">{patient.nomeMae}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProtocolCard({
  protocol,
  onDownloadPdf,
  isDownloading,
}: {
  protocol: ProtocolData;
  onDownloadPdf: (protocol: ProtocolData) => void;
  isDownloading: boolean;
}) {
  const [examesExpanded, setExamesExpanded] = useState(false);
  
  // Parse exames - split by <br>, comma, or semicolon and filter empty entries
  const examesList = protocol.exames
    ? protocol.exames
        .split(/<br\s*\/?>/i)
        .flatMap(item => item.split(/[,;]/))
        .map(item => item.trim())
        .filter(Boolean)
    : [];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Protocolo {protocol.protocolo}</CardTitle>
            </div>
            <CardDescription className="mt-1">
              {formatDate(protocol.data)} • {protocol.convenio || "Particular"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Use portal-validated status for accurate availability */}
            {protocol.resultadoDisponivelPortal ? (
              <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Liberado
              </Badge>
            ) : protocol.resultadoLiberado ? (
              // Autolac says released but portal doesn't have it yet
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20">
                <Clock className="h-3 w-3 mr-1" />
                Processando
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Clock className="h-3 w-3 mr-1" />
                Aguardando
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {protocol.dataEntrega && (
          <p className="text-sm text-muted-foreground mb-3">
            Entrega prevista: {formatDate(protocol.dataEntrega)}
          </p>
        )}

        {examesList.length > 0 && (
          <Collapsible open={examesExpanded} onOpenChange={setExamesExpanded}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full text-left mb-2 hover:bg-muted/50 rounded-md p-1.5 -ml-1.5 transition-colors group">
                {examesExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
                <span className="text-sm font-medium">
                  {examesList.length} {examesList.length === 1 ? 'exame' : 'exames'}
                </span>
                {!examesExpanded && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (clique para expandir)
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mb-4">
              <div className="flex flex-wrap gap-1.5 pl-6">
                {examesList.map((exame, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs font-normal">
                    {exame.trim()}
                  </Badge>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <Separator className="my-4" />

        <Button
          onClick={() => onDownloadPdf(protocol)}
          disabled={!protocol.resultadoDisponivelPortal || isDownloading}
          className="w-full"
          variant={protocol.resultadoDisponivelPortal ? "default" : "secondary"}
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4 mr-2" />
              {protocol.resultadoDisponivelPortal 
                ? "Visualizar Laudo" 
                : protocol.resultadoLiberado 
                  ? "Resultado em processamento"
                  : "Resultado não disponível"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PatientLookup() {
  const [downloadingProtocol, setDownloadingProtocol] = useState<number | null>(null);
  const { patient: authPatient } = usePatientAuth();
  const { 
    isLoading, 
    error, 
    patient, 
    protocols, 
    searchByCpf, 
    pdfViewer,
    closePdfViewer,
    downloadPdf,
    triggerPdfDownload,
  } = usePatientHistory();

  // Auto-fetch patient data using authenticated CPF
  useEffect(() => {
    if (authPatient?.cpf) {
      searchByCpf(authPatient.cpf);
    }
  }, [authPatient?.cpf]);

  const handleDownloadPdf = async (protocol: ProtocolData) => {
    setDownloadingProtocol(protocol.protocolo);
    try {
      await downloadPdf(protocol);
    } finally {
      setDownloadingProtocol(null);
    }
  };

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header - Hidden on mobile since MobileLayout has its own */}
        <div className="mb-6 sm:mb-8 hidden sm:block">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Meus Resultados</h1>
              <p className="text-muted-foreground">
                Visualize seu histórico completo de exames
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card className="py-10 sm:py-16">
            <CardContent className="flex flex-col items-center justify-center text-center px-4">
              <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 text-primary animate-spin mb-3 sm:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-1 sm:mb-2">
                Carregando seus resultados...
              </h3>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && !isLoading && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Patient Data */}
        {patient && !isLoading && (
          <>
            <PatientHeader patient={patient} />

            {/* Protocols List */}
            <div className="mt-4 sm:mt-8">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="text-lg sm:text-xl font-semibold">
                  Histórico de exames ({protocols.length})
                </h2>
              </div>

              {protocols.length === 0 ? (
                <Card className="py-8 sm:py-12">
                  <CardContent className="flex flex-col items-center justify-center text-center">
                    <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mb-3 sm:mb-4" />
                    <h3 className="text-base sm:text-lg font-medium text-muted-foreground">
                      Nenhum atendimento encontrado
                    </h3>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  {protocols.map((protocol) => (
                    <ProtocolCard
                      key={protocol.protocolo}
                      protocol={protocol}
                      onDownloadPdf={handleDownloadPdf}
                      isDownloading={downloadingProtocol === protocol.protocolo}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* PDF Viewer Dialog - Supports both portal PDF and local HTML rendering */}
      <PdfViewerDialog
        isOpen={pdfViewer.isOpen}
        onClose={closePdfViewer}
        isLoading={pdfViewer.isLoading}
        htmlContent={pdfViewer.htmlContent}
        protocolNumber={pdfViewer.protocolNumber}
        error={pdfViewer.error}
        onDownload={triggerPdfDownload}
        pdfBlob={pdfViewer.pdfBlob}
        pdfSource={pdfViewer.pdfSource}
      />
    </MainLayout>
  );
}
