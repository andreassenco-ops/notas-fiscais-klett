import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, FileText, Download, Send, CheckCircle2, XCircle, AlertTriangle, FileDown, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotaFiscalRow {
  PROTOCOLOC: string;
  "DATA DO PAGAMENTO": string;
  CONVENIO: string;
  NOME: string;
  CPF: string;
  OBSERVAÇÃO: string;
  "FORMA DE PAGAMENTO": string;
  "VALOR TOTAL DO PAGAMENTO": number | null;
  [key: string]: unknown;
  // NFS-e state (client-side only)
  _nfseStatus?: "pending" | "emitting" | "success" | "error" | "already_emitted";
  _nfseChave?: string;
  _nfseNumero?: string;
  _nfseError?: string;
  _nfsePdfUrl?: string;
}

function buildQuery(dateStr: string): string {
  return `SELECT 
  SOLICITACAO.LOCAL + '-' + dbo.MASCARA(SOLICITACAO.PROTOCOLO,'000000') AS PROTOCOLOC,
  CONVERT(VARCHAR(10), SOLICITACAO_PAGAMENTOS.DATA, 23) AS [DATA DO PAGAMENTO],
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI [OBSERVAÇÃO],
  SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO [FORMA DE PAGAMENTO],
  SUM(SOLICITACAO_PAGAMENTOS.VALOR) [VALOR TOTAL DO PAGAMENTO]
FROM SOLICITACAO
INNER JOIN SOLICITACAO_GUIA ON SOLICITACAO_GUIA.SOLICITACAO_ID = SOLICITACAO.ID
INNER JOIN SOLICITACAO_PAGAMENTOS ON SOLICITACAO_GUIA.ID = SOLICITACAO_PAGAMENTOS.SOLICITACAO_GUIA_ID
INNER JOIN PACIENTE ON (PACIENTE.ID = SOLICITACAO.PACIENTE)
INNER JOIN LOCAL ON (LOCAL.ID = SOLICITACAO.LOCAL)
 WHERE SOLICITACAO_PAGAMENTOS.DATA BETWEEN '${dateStr}' AND '${dateStr}'
  AND UPPER(LTRIM(RTRIM(SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO))) NOT IN ('DINHEIRO', 'DINHEIROTOX', 'CARTAO CREDITO TOX')
  AND SOLICITACAO.LOCAL != '09'
GROUP BY SOLICITACAO.LOCAL, SOLICITACAO.PROTOCOLO,
  CONVERT(VARCHAR(10), SOLICITACAO_PAGAMENTOS.DATA, 23),
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI,
  SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO`;
}

// ─── Helper functions ───

const formatCurrency = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatCPF = (cpf: string) => {
  if (!cpf) return "—";
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11) return cpf;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
};

const formatDate = (val: unknown) => {
  if (!val) return "—";
  try {
    const str = String(val);
    // If already in YYYY-MM-DD format (from SQL CONVERT), parse without timezone shift
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return new Date(str).toLocaleDateString("pt-BR");
  } catch {
    return String(val);
  }
};

// ─── NFS-e Status Badge ───

function NfseStatusBadge({ row, onDownloadPdf }: { row: NotaFiscalRow; onDownloadPdf: (row: NotaFiscalRow) => void }) {
  if (!row._nfseStatus) return null;
  
  switch (row._nfseStatus) {
    case "emitting":
      return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Emitindo...</Badge>;
    case "success":
      return (
        <div className="flex items-center gap-1">
          <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />Emitida{row._nfseNumero ? ` #${row._nfseNumero}` : ''}</Badge>
          {row._nfsePdfUrl ? (
            <a href={row._nfsePdfUrl} download={`nfse-${row._nfseNumero || row.PROTOCOLOC}.pdf`}>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Baixar PDF da NFS-e">
                <FileDown className="h-3.5 w-3.5 text-primary" />
              </Button>
            </a>
          ) : row._nfseChave ? (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Baixar PDF da NFS-e"
              onClick={() => onDownloadPdf(row)}>
              <FileDown className="h-3.5 w-3.5 text-primary" />
            </Button>
          ) : null}
        </div>
      );
    case "already_emitted":
      return (
        <div className="flex items-center gap-1">
          <Badge className="gap-1 bg-yellow-600 text-white"><AlertTriangle className="h-3 w-3" />Já emitida</Badge>
          {row._nfseChave && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Baixar PDF da NFS-e"
              onClick={() => onDownloadPdf(row)}>
              <FileDown className="h-3.5 w-3.5 text-primary" />
            </Button>
          )}
        </div>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1" title={row._nfseError}>
          <XCircle className="h-3 w-3" />{row._nfseError?.slice(0, 30) || "Erro"}
        </Badge>
      );
    default:
      return null;
  }
}

// Persistent NFS-e status store (survives row refreshes)
interface NfseState {
  status: "pending" | "emitting" | "success" | "error" | "already_emitted";
  chave?: string;
  numero?: string;
  error?: string;
  pdfUrl?: string;
}

export default function NotasFiscais() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<NotaFiscalRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasQueried, setHasQueried] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [emittingLote, setEmittingLote] = useState(false);
  const [ambiente] = useState<"1">("1");
  const [nfseStore, setNfseStore] = useState<Map<string, NfseState>>(new Map());
  
  // Default to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [queryDate, setQueryDate] = useState<Date>(yesterday);

  // Helper: apply nfseStore state to rows
  const applyNfseState = (rawRows: NotaFiscalRow[], store: Map<string, NfseState>): NotaFiscalRow[] => {
    return rawRows.map((row) => {
      const saved = store.get(row.PROTOCOLOC);
      if (saved) {
        return {
          ...row,
          _nfseStatus: saved.status,
          _nfseChave: saved.chave,
          _nfseNumero: saved.numero,
          _nfseError: saved.error,
          _nfsePdfUrl: saved.pdfUrl,
        };
      }
      return row;
    });
  };

  const runQuery = async () => {
    setLoading(true);
    const dateStr = format(queryDate, "yyyy-MM-dd");
    try {
      const { data: result, error } = await supabase.functions.invoke('test-sql-query', {
        body: { sql_query: buildQuery(dateStr), limit: 1000 },
      });

      if (error) {
        toast.error(error.message || "Erro ao consultar");
        return;
      }

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      const rawRows: NotaFiscalRow[] = result.rows || [];
      
      // Fetch already-emitted notes from database
      if (rawRows.length > 0) {
        const protocolos = rawRows.map(r => r.PROTOCOLOC);
        const { data: emitidas } = await supabase
          .from('nfse_emitidas')
          .select('protocolo, chave_acesso, numero_nota, ndps')
          .in('protocolo', protocolos);
        
        if (emitidas && emitidas.length > 0) {
          const dbStore = new Map<string, NfseState>();
          for (const e of emitidas) {
            dbStore.set(e.protocolo, {
              status: "success",
              chave: e.chave_acesso || undefined,
              numero: e.numero_nota || e.ndps || undefined,
            });
          }
          // Merge db data into nfseStore
          setNfseStore((prev) => {
            const next = new Map(prev);
            dbStore.forEach((v, k) => next.set(k, v));
            return next;
          });
          // Apply combined state
          const combinedStore = new Map(nfseStore);
          dbStore.forEach((v, k) => combinedStore.set(k, v));
          setRows(applyNfseState(rawRows, combinedStore));
        } else {
          setRows(applyNfseState(rawRows, nfseStore));
        }
      } else {
        setRows([]);
      }

      setHasQueried(true);
      setSelectedRows(new Set());
      toast.success(`${rawRows.length} protocolos encontrados`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao consultar"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async (row: NotaFiscalRow) => {
    if (!row._nfseChave) {
      toast.error("Chave de acesso não disponível para esta nota");
      return;
    }
    const toastId = toast.loading("Baixando PDF da NFS-e...");
    try {
      const result = await api.fetchDanfse(row._nfseChave, Number(ambiente) as 1 | 2);
      if (result.success && result.pdfBase64) {
        const byteChars = atob(result.pdfBase64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(blob);
        
        // Update store and rows with the PDF URL
        setNfseStore((prev) => {
          const next = new Map(prev);
          const existing = next.get(row.PROTOCOLOC);
          if (existing) next.set(row.PROTOCOLOC, { ...existing, pdfUrl });
          return next;
        });
        setRows((prev) => prev.map((r) => 
          r.PROTOCOLOC === row.PROTOCOLOC ? { ...r, _nfsePdfUrl: pdfUrl } : r
        ));
        
        // Trigger download
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `nfse-${row._nfseNumero || row.PROTOCOLOC}.pdf`;
        a.click();
        toast.success("PDF baixado com sucesso", { id: toastId });
      } else {
        toast.error(result.error || "Erro ao baixar PDF", { id: toastId });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao baixar PDF", { id: toastId });
    }
  };

  const filteredRows = searchTerm
    ? rows.filter((row) =>
        Object.values(row).some(
          (val) =>
            val &&
            typeof val === "string" &&
            val.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : rows;

  const toggleSelect = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((_, i) => i)));
    }
  };

  const emitirSelecionadas = async () => {
    if (selectedRows.size === 0) {
      toast.warning("Selecione pelo menos um protocolo");
      return;
    }

    const selectedItems = Array.from(selectedRows).map((idx) => filteredRows[idx]);
    const invalidItems = selectedItems.filter(
      (r) => !r.CPF || !r["VALOR TOTAL DO PAGAMENTO"] || Number(r["VALOR TOTAL DO PAGAMENTO"]) <= 0
    );

    if (invalidItems.length > 0) {
      toast.error(`${invalidItems.length} protocolo(s) sem CPF ou valor válido`);
      return;
    }

    setEmittingLote(true);

    // Mark selected rows as emitting (both in rows and store)
    const emittingProtocols = selectedItems.map(r => r.PROTOCOLOC);
    setNfseStore((prev) => {
      const next = new Map(prev);
      emittingProtocols.forEach(p => next.set(p, { status: "emitting" }));
      return next;
    });
    setRows((prev) =>
      prev.map((row) =>
        emittingProtocols.includes(row.PROTOCOLOC)
          ? { ...row, _nfseStatus: "emitting" as const }
          : row
      )
    );

    try {
      const items = selectedItems.map((r) => ({
        protocolo: r.PROTOCOLOC,
        pacienteNome: r.NOME,
        cpf: String(r.CPF).replace(/\D/g, ""),
        valor: Number(r["VALOR TOTAL DO PAGAMENTO"]),
        formaPagamento: r["FORMA DE PAGAMENTO"],
        dataAtendimento: String(r["DATA DO PAGAMENTO"] || ""),
      }));

      const result = await api.emitirNfseLote(items, Number(ambiente) as 1 | 2);

      // Build new store entries and update rows
      const newStoreEntries = new Map<string, NfseState>();
      
      setRows((prev) =>
        prev.map((row) => {
          const match = result.results?.find((r: any) => r.protocolo === row.PROTOCOLOC);
          if (match) {
            const isAlreadyEmitted = !match.success && match.jaEmitida;
            const finalStatus = match.success ? "success" : (isAlreadyEmitted ? "already_emitted" : "error");
            
            // Create PDF blob URL from base64
            let pdfUrl: string | undefined;
            if (match.pdfBase64) {
              try {
                const byteChars = atob(match.pdfBase64);
                const byteNums = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
                const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
                pdfUrl = URL.createObjectURL(blob);
              } catch { /* ignore */ }
            }

            const state: NfseState = {
              status: finalStatus,
              chave: match.chNFSe,
              numero: match.nDFSe || match.nNFSe || match.nDPS,
              error: isAlreadyEmitted ? "Já emitida anteriormente" : match.error,
              pdfUrl,
            };
            newStoreEntries.set(row.PROTOCOLOC, state);
            return {
              ...row,
              _nfseStatus: state.status,
              _nfseChave: state.chave,
              _nfseNumero: state.numero,
              _nfseError: state.error,
              _nfsePdfUrl: state.pdfUrl,
            };
          }
          return row;
        })
      );

      // Persist to store
      setNfseStore((prev) => {
        const next = new Map(prev);
        newStoreEntries.forEach((v, k) => next.set(k, v));
        return next;
      });

      // Save successful emissions to database
      const successResults = result.results?.filter((r: any) => r.success);
      if (successResults?.length > 0) {
        const dbRows = successResults.map((r: any) => ({
          protocolo: r.protocolo,
          chave_acesso: r.chNFSe || null,
          numero_nota: r.nDFSe || r.nNFSe || null,
          ndps: r.nDPS || null,
          valor: r.dados?.valor || null,
          paciente_nome: r.dados?.pacienteNome || null,
          cpf: r.dados?.cpf || null,
        }));
        await supabase.from('nfse_emitidas').upsert(dbRows, { onConflict: 'protocolo' });
      }

      if (result.emitidas > 0) {
        toast.success(`${result.emitidas} NFS-e(s) emitida(s) com sucesso!`);
      }
      if (result.erros > 0) {
        const errorDetails = result.results
          ?.filter((r: any) => !r.success)
          ?.map((r: any) => `${r.protocolo}: ${r.error}`)
          ?.join('\n') || '';
        toast.error(`${result.erros} erro(s) na emissão`, {
          description: errorDetails.substring(0, 300),
          duration: 10000,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao emitir lote");
      setNfseStore((prev) => {
        const next = new Map(prev);
        emittingProtocols.forEach(p => next.set(p, { status: "error", error: "Falha na comunicação" }));
        return next;
      });
      setRows((prev) =>
        prev.map((row) =>
          row._nfseStatus === "emitting"
            ? { ...row, _nfseStatus: "error" as const, _nfseError: "Falha na comunicação" }
            : row
        )
      );
    } finally {
      setEmittingLote(false);
      setSelectedRows(new Set());
    }
  };



  const exportCSV = () => {
    if (!filteredRows.length) return;
    const displayCols = [
      "PROTOCOLOC", "DATA DO PAGAMENTO", "CONVENIO", "NOME", "CPF",
      "FORMA DE PAGAMENTO", "VALOR TOTAL DO PAGAMENTO", "OBSERVAÇÃO"
    ];
    const extraHeader = "Nº Nota Fiscal";
    const header = [...displayCols, extraHeader].join(";");
    const csvRows = filteredRows.map((row) => {
      const baseCols = displayCols.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        return String(val).replace(/;/g, ",");
      });
      // Append NF number
      baseCols.push(row._nfseNumero || "");
      return baseCols.join(";");
    });
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notas-fiscais-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalValor = filteredRows.reduce((sum, row) => {
    const val = Number(row["VALOR TOTAL DO PAGAMENTO"]);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const selectedValor = Array.from(selectedRows).reduce((sum, idx) => {
    const val = Number(filteredRows[idx]?.["VALOR TOTAL DO PAGAMENTO"]);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Notas Fiscais
            </h1>
            <p className="text-muted-foreground mt-1">
              Consulta de pagamentos do dia e emissão de NFS-e Nacional
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Data da consulta</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-44 justify-start text-left font-normal", !queryDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {queryDate ? format(queryDate, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={queryDate}
                    onSelect={(d) => d && setQueryDate(d)}
                    locale={ptBR}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={runQuery} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Consultar
            </Button>
            {filteredRows.length > 0 && (
              <Button variant="outline" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {hasQueried && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Protocolos</div>
                <div className="text-2xl font-bold text-foreground">{filteredRows.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Valor Total</div>
                <div className="text-2xl font-bold text-primary">{formatCurrency(totalValor)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Selecionados</div>
                <div className="text-2xl font-bold text-foreground">
                  {selectedRows.size > 0 ? `${selectedRows.size} — ${formatCurrency(selectedValor)}` : "Nenhum"}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* NFS-e Emission Controls */}
        {hasQueried && filteredRows.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Send className="h-5 w-5 text-primary" />
                  <span className="font-medium">Emissão NFS-e Nacional — Produção</span>
                </div>
                <Button
                  onClick={emitirSelecionadas}
                  disabled={selectedRows.size === 0 || emittingLote}
                  className="gap-2"
                >
                  {emittingLote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Emitir {selectedRows.size > 0 ? `${selectedRows.size} NFS-e(s)` : "NFS-e"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Pagamentos do Dia</CardTitle>
              {rows.length > 0 && (
                <div className="w-64">
                  <Input
                    placeholder="Filtrar por nome, CPF, convênio..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!hasQueried ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Selecione a data e clique em <strong>Consultar</strong> para buscar os pagamentos no Autolac.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Nenhum pagamento encontrado para {format(queryDate, "dd/MM/yyyy")}.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedRows.size === filteredRows.length && filteredRows.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-28">Protocolo</TableHead>
                      <TableHead className="w-24">Data Pgto</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="w-36">CPF</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Forma Pgto</TableHead>
                      <TableHead className="text-right w-32">Valor Total</TableHead>
                      <TableHead className="w-24">Nº Nota</TableHead>
                      <TableHead>NFS-e</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, idx) => (
                      <TableRow key={idx} className={selectedRows.has(idx) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(idx)}
                            onCheckedChange={() => toggleSelect(idx)}
                            disabled={row._nfseStatus === "success" || row._nfseStatus === "already_emitted"}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {row.PROTOCOLOC}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(row["DATA DO PAGAMENTO"])}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {row.NOME}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCPF(String(row.CPF || ""))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs whitespace-nowrap">
                            {row.CONVENIO || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row["FORMA DE PAGAMENTO"] || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(row["VALOR TOTAL DO PAGAMENTO"])}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-center">
                          {row._nfseNumero || "—"}
                        </TableCell>
                        <TableCell>
                          <NfseStatusBadge row={row} onDownloadPdf={handleDownloadPdf} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
