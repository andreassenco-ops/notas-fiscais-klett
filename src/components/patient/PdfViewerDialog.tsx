import { useMemo } from "react";
import { Loader2, Download, AlertCircle, X, FileCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PdfBlobViewer } from "./PdfBlobViewer";

interface PdfViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  htmlContent: string | null;
  protocolNumber: number | null;
  error: string | null;
  onDownload: () => void;
  pdfBlob?: Blob | null;
  pdfSource?: 'local' | 'portal' | null;
}

export function PdfViewerDialog({
  isOpen,
  onClose,
  isLoading,
  htmlContent,
  protocolNumber,
  error,
  onDownload,
  pdfBlob,
  pdfSource,
}: PdfViewerDialogProps) {
  const hasContent = useMemo(() => 
    Boolean(htmlContent || pdfBlob), 
    [htmlContent, pdfBlob]
  );

  const sourceLabel = useMemo(() => {
    if (pdfSource === 'portal') return 'Base Klett';
    if (pdfSource === 'local') return 'Gerado localmente';
    return null;
  }, [pdfSource]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <DialogTitle className="text-lg">
                  Laudo - Protocolo {protocolNumber}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Visualização do resultado do exame
                </DialogDescription>
              </div>
              {sourceLabel && !isLoading && hasContent && (
                <Badge 
                  variant={pdfSource === 'portal' ? 'default' : 'secondary'} 
                  className="gap-1"
                >
                  <FileCheck className="h-3 w-3" />
                  {sourceLabel}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="default" 
                size="sm" 
                onClick={onDownload}
                disabled={isLoading || !hasContent}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Baixar PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/30 relative">
          {/* Loading state */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">
                {pdfSource === 'portal' 
                  ? 'Buscando resultado na base de dados Klett...' 
                  : 'Gerando laudo...'}
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground text-center">
                Não foi possível carregar o laudo. Tente novamente mais tarde.
              </p>
            </div>
          )}

          {/* PDF do portal: renderizado via pdf.js (não depende de plugin/iframe) */}
          {pdfBlob && !isLoading && !error && (
            <PdfBlobViewer
              blob={pdfBlob}
              title={`Laudo ${protocolNumber}`}
            />
          )}

          {/* HTML content preview (local generation) */}
          {htmlContent && !pdfBlob && !isLoading && !error && (
            <div className="p-4">
              <div 
                className="bg-white rounded-lg shadow-lg mx-auto max-w-[210mm] min-h-[297mm] p-8"
                style={{ 
                  fontFamily: "'Times New Roman', Times, serif",
                  fontSize: "12pt",
                  lineHeight: "1.4",
                  color: "#000",
                }}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>
          )}

          {/* Empty state */}
          {!hasContent && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-muted-foreground">Nenhum conteúdo disponível</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
