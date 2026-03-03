import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// Configure pdf.js worker for Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfBlobViewerProps {
  blob: Blob;
  title?: string;
}

export function PdfBlobViewer({ blob, title }: PdfBlobViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);

  const file = useMemo(() => blob, [blob]);

  // Reset pagination when a new PDF is loaded
  useEffect(() => {
    setNumPages(0);
    setPage(1);
  }, [blob]);

  // Track container size for responsive page rendering
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setContainerWidth(Math.max(0, Math.floor(w)));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = containerWidth
    ? Math.min(containerWidth - 32 /* padding */, 900)
    : 900;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-background">
        <div className="text-sm text-muted-foreground truncate">
          {title ?? "PDF"}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || numPages <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="text-sm tabular-nums text-muted-foreground min-w-[88px] text-center">
            {numPages ? `${page} / ${numPages}` : "—"}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p))}
            disabled={!numPages || page >= numPages}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-muted/30">
        <div className="p-4 flex justify-center">
          <Document
            file={file}
            onLoadSuccess={(info) => setNumPages(info.numPages)}
            loading={
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando PDF…
              </div>
            }
            error={
              <div className="text-sm text-muted-foreground">
                Não foi possível renderizar o PDF no preview.
              </div>
            }
          >
            <Page
              pageNumber={page}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Renderizando página…
                </div>
              }
            />
          </Document>
        </div>
      </div>
    </div>
  );
}
