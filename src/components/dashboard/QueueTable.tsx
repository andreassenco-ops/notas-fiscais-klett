import { RefreshCw, ExternalLink, MoreHorizontal, ChevronDown, ChevronRight, Link2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceInSaoPaulo, formatDateTimeInSaoPaulo } from "@/lib/timezone";
import { useState } from "react";

export interface QueueItem {
  id: string;
  sequence_num: number;
  patient_name: string;
  cpf: string;
  phone: string;
  protocol: string;
  result_link: string;
  model_id?: number | null;
  model_name?: string | null;
  variables?: Record<string, string> | null;
  status: "PENDING" | "SENT" | "ERROR" | "SKIPPED";
  created_at: string;
  sent_at?: string;
  error_message?: string;
  /** Indica se este telefone já foi contactado segundo os logs, mesmo que status != SENT */
  deliveredViaLog?: boolean;
}

interface QueueTableProps {
  items: QueueItem[];
  onResend: (id: string) => void;
  isLoading?: boolean;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

const statusConfig = {
  PENDING: {
    label: "Pendente",
    className: "bg-warning/10 text-warning",
  },
  SENT: {
    label: "Enviado",
    className: "bg-success/10 text-success",
  },
  ERROR: {
    label: "Erro",
    className: "bg-destructive/10 text-destructive",
  },
  SKIPPED: {
    label: "Ignorado",
    className: "bg-muted text-muted-foreground",
  },
  // Badge especial para itens que aparecem no log mas não têm status SENT
  DELIVERED_VIA_LOG: {
    label: "Entregue (log)",
    className: "bg-emerald-500/10 text-emerald-600",
  },
};

function maskCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11) return cpf;
  return `${cleaned.slice(0, 3)}.***.**${cleaned.slice(9)}`;
}

function formatExames(exames: string | undefined): string[] {
  if (!exames) return [];
  // Replace [[BL]] with newlines, then split
  return exames
    .replace(/\[\[BL\]\]/g, "\n")
    .split("\n")
    .map(e => e.trim())
    .filter(e => e.length > 0);
}

function QueueItemRow({ 
  item, 
  onResend, 
  isLoading 
}: { 
  item: QueueItem; 
  onResend: (id: string) => void;
  isLoading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  
  // Determinar o config de status a exibir
  // Se item.status !== SENT mas deliveredViaLog é true, mostrar badge especial
  const effectiveStatusKey = 
    item.status !== "SENT" && item.deliveredViaLog 
      ? "DELIVERED_VIA_LOG" 
      : item.status;
  const config = statusConfig[effectiveStatusKey];
  
  const variables = item.variables || {};
  const exames = formatExames(variables.EXAMES);
  const url = variables.URL || item.result_link;

  return (
    <>
      <tr 
        className={cn(
          "table-row-hover cursor-pointer transition-colors",
          expanded && "bg-muted/30"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="w-8">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </td>
        <td className="font-mono text-xs text-muted-foreground">
          {item.sequence_num}
        </td>
        <td>
          <div className="flex flex-col">
            <span className="font-medium">{item.patient_name}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {maskCPF(item.cpf)}
            </span>
          </div>
        </td>
        <td className="font-mono text-sm">{item.protocol}</td>
        <td className="text-sm text-muted-foreground">
          {exames.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span className="font-medium text-foreground">{exames.length}</span>
              <span>exame{exames.length !== 1 ? 's' : ''}</span>
            </span>
          ) : (
            <span>—</span>
          )}
        </td>
        <td>
          <span
            className={cn(
              "inline-flex px-2 py-1 rounded-full text-xs font-medium",
              config.className
            )}
          >
            {config.label}
          </span>
        </td>
        <td className="text-sm text-muted-foreground" title={formatDateTimeInSaoPaulo(item.created_at)}>
          {formatDistanceInSaoPaulo(item.created_at)}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onResend(item.id)}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reenviar
              </DropdownMenuItem>
              {url && (
                <DropdownMenuItem asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver resultado
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      
      {/* Expanded details row */}
      {expanded && (
        <tr className="bg-muted/20 border-t-0">
          <td colSpan={8} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Exames list */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  Exames para envio
                  {exames.length > 0 && (
                    <span className="inline-flex px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">
                      {exames.length}
                    </span>
                  )}
                </h4>
                {exames.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {exames.map((exame, idx) => (
                      <li 
                        key={idx} 
                        className="flex items-start gap-2 py-1 px-2 rounded bg-background/50"
                      >
                        <span className="text-muted-foreground font-mono text-xs min-w-[20px]">
                          {idx + 1}.
                        </span>
                        <span className="text-foreground">{exame}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Nenhum exame listado nas variáveis
                  </p>
                )}
              </div>
              
              {/* Right: Other info */}
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">Link do Resultado</h4>
                  {url ? (
                    <a 
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                    >
                      <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                      {url}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Não disponível</span>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">Telefone</h4>
                  <span className="font-mono text-sm">{item.phone}</span>
                </div>
                
                {item.model_name && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Modelo</h4>
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {item.model_name}
                    </span>
                  </div>
                )}
                
                {item.error_message && (
                  <div>
                    <h4 className="text-sm font-medium text-destructive mb-1">Erro</h4>
                    <p className="text-sm text-destructive/80 bg-destructive/5 p-2 rounded">
                      {item.error_message}
                    </p>
                  </div>
                )}
                
                {item.sent_at && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Enviado</h4>
                    <span className="text-sm text-muted-foreground" title={formatDateTimeInSaoPaulo(item.sent_at)}>
                      {formatDistanceInSaoPaulo(item.sent_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function QueueTable({ items, onResend, isLoading, currentPage = 1, totalPages = 1, onPageChange }: QueueTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-muted-foreground">Nenhum item na fila</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      {/* Scrollable table container */}
      <div className="overflow-auto max-h-[calc(100vh-320px)] min-h-[400px]">
        <table className="data-table">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="w-8"></th>
              <th>#</th>
              <th>Paciente</th>
              <th>Protocolo</th>
              <th>Exames</th>
              <th>Status</th>
              <th>Criado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onResend={onResend}
                isLoading={isLoading}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
