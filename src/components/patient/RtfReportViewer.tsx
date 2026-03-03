import { useEffect, useRef, useState } from "react";
import { Loader2, FileText, AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RtfReportViewerProps {
  html: string | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
}

/**
 * Component to display RTF-rendered HTML content
 * Provides proper styling and error handling for lab reports
 */
export function RtfReportViewer({
  html,
  isLoading,
  error,
  onRetry,
}: RtfReportViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Inject HTML content safely
  useEffect(() => {
    if (containerRef.current && html) {
      try {
        containerRef.current.innerHTML = html;
        setRenderError(null);
      } catch (err) {
        console.error("[RtfReportViewer] Error injecting HTML:", err);
        setRenderError("Erro ao renderizar o documento");
      }
    }
  }, [html]);

  // Loading state
  if (isLoading) {
    return (
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Gerando relatório...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error || renderError) {
    return (
      <Card className="min-h-[400px]">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error || renderError}
            </AlertDescription>
          </Alert>
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!html) {
    return (
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">
              Nenhum relatório gerado
            </p>
            <p className="text-sm text-muted-foreground/70">
              Selecione um exame para visualizar o laudo
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Rendered content
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div 
          ref={containerRef}
          className="rtf-report-container p-6 bg-white min-h-[400px]"
          style={{
            // Ensure RTF content renders with proper styling
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: "12pt",
            lineHeight: 1.5,
            color: "#000",
          }}
        />
      </CardContent>
    </Card>
  );
}

// Add CSS for RTF content styling
const rtfStyles = `
.rtf-report-container {
  background: white;
  box-shadow: 0 0 10px rgba(0,0,0,0.1);
}

.rtf-report-container .rtf-rendered-content {
  width: 100%;
}

.rtf-report-container p {
  margin: 0.25em 0;
}

.rtf-report-container table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.rtf-report-container td,
.rtf-report-container th {
  border: 1px solid #ccc;
  padding: 0.25em 0.5em;
}

.rtf-report-container b,
.rtf-report-container strong {
  font-weight: bold;
}

.rtf-report-container i,
.rtf-report-container em {
  font-style: italic;
}

.rtf-report-container u {
  text-decoration: underline;
}
`;

// Inject styles on load
if (typeof document !== 'undefined') {
  const styleId = 'rtf-report-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = rtfStyles;
    document.head.appendChild(style);
  }
}
