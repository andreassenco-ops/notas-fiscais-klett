import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, FileText, Download, Send, CheckCircle2, XCircle, AlertTriangle, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

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
  _nfseStatus?: "pending" | "emitting" | "success" | "error";
  _nfseChave?: string;
  _nfseError?: string;
}

function buildQuery(): string {
  return `SELECT 
  SOLICITACAO.LOCAL + '-' + dbo.MASCARA(SOLICITACAO.PROTOCOLO,'000000') AS PROTOCOLOC,
  SOLICITACAO_PAGAMENTOS.DATA [DATA DO PAGAMENTO],
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI [OBSERVAÇÃO],
  SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO [FORMA DE PAGAMENTO],
  SOLICITACAO_PAGAMENTOS.VALOR [VALOR TOTAL DO PAGAMENTO]
FROM SOLICITACAO
INNER JOIN SOLICITACAO_GUIA ON SOLICITACAO_GUIA.SOLICITACAO_ID = SOLICITACAO.ID
INNER JOIN SOLICITACAO_PAGAMENTOS ON SOLICITACAO_GUIA.ID = SOLICITACAO_PAGAMENTOS.SOLICITACAO_GUIA_ID
INNER JOIN PACIENTE ON (PACIENTE.ID = SOLICITACAO.PACIENTE)
INNER JOIN LOCAL ON (LOCAL.ID = SOLICITACAO.LOCAL)
WHERE SOLICITACAO_PAGAMENTOS.DATA BETWEEN CAST(GETDATE()-1 AS DATE) AND CAST(GETDATE()-1 AS DATE)
GROUP BY SOLICITACAO.LOCAL, SOLICITACAO.PROTOCOLO,
  SOLICITACAO_PAGAMENTOS.DATA,
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI,
  SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO,
  SOLICITACAO_PAGAMENTOS.VALOR`;
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
    return new Date(String(val)).toLocaleDateString("pt-BR");
  } catch {
    return String(val);
  }
};

// ─── NFS-e Status Badge ───

function NfseStatusBadge({ row, ambiente, onDownloadPdf }: { row: NotaFiscalRow; ambiente: string; onDownloadPdf: (chave: string) => void }) {
  if (!row._nfseStatus) return null;
  
  switch (row._nfseStatus) {
    case "emitting":
      return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Emitindo...</Badge>;
    case "success":
      return (
        <div className="flex items-center gap-1">
          <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />Emitida</Badge>
          {row._nfseChave && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Baixar PDF da NFS-e"
              onClick={() => onDownloadPdf(row._nfseChave!)}
            >
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

export default function NotasFiscais() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<NotaFiscalRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasQueried, setHasQueried] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [emittingLote, setEmittingLote] = useState(false);
  const [ambiente, setAmbiente] = useState<"1" | "2">("2"); // 2=Homologação

  const runQuery = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('test-sql-query', {
        body: { sql_query: buildQuery(), limit: 1000 },
      });

      if (error) {
        toast.error(error.message || "Erro ao consultar");
        return;
      }

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      if (result.rows) setRows(result.rows);
      setHasQueried(true);
      setSelectedRows(new Set());
      toast.success(`${result.rows?.length || 0} protocolos encontrados`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao consultar"
      );
    } finally {
      setLoading(false);
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

    // Mark selected rows as emitting
    setRows((prev) =>
      prev.map((row, idx) =>
        selectedRows.has(filteredRows.indexOf(row))
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
      }));

      const result = await api.emitirNfseLote(items, Number(ambiente) as 1 | 2);

      // Update rows with results
      setRows((prev) =>
        prev.map((row) => {
          const match = result.results?.find((r: any) => r.protocolo === row.PROTOCOLOC);
          if (match) {
            return {
              ...row,
              _nfseStatus: match.success ? ("success" as const) : ("error" as const),
              _nfseChave: match.chNFSe,
              _nfseError: match.error,
            };
          }
          return row;
        })
      );

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
      // Mark all as error
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

  const downloadDanfse = async (chave: string) => {
    try {
      toast.info("Buscando PDF da NFS-e...");
      const result = await api.fetchDanfse(chave, Number(ambiente) as 1 | 2);
      if (result.success && result.pdfBase64) {
        const blob = new Blob(
          [Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))],
          { type: "application/pdf" }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `nfse-${chave}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("PDF baixado com sucesso!");
      } else {
        toast.error(result.error || "Erro ao buscar PDF");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao buscar PDF");
    }
  };

  const exportCSV = () => {
    if (!filteredRows.length) return;
    const displayCols = [
      "PROTOCOLOC", "DATA DO PAGAMENTO", "CONVENIO", "NOME", "CPF",
      "FORMA DE PAGAMENTO", "VALOR TOTAL DO PAGAMENTO", "OBSERVAÇÃO"
    ];
    const header = displayCols.join(";");
    const csvRows = filteredRows.map((row) =>
      displayCols.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        return String(val).replace(/;/g, ",");
      }).join(";")
    );
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
          <div className="flex gap-2 flex-wrap">
            <Button onClick={runQuery} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Consultar Hoje
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
                  <span className="font-medium">Emissão NFS-e Nacional</span>
                  <Select value={ambiente} onValueChange={(v) => setAmbiente(v as "1" | "2")}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                          Homologação
                        </span>
                      </SelectItem>
                      <SelectItem value="1">Produção</SelectItem>
                    </SelectContent>
                  </Select>
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
              {ambiente === "2" && (
                <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Ambiente de homologação — notas não têm validade fiscal
                </p>
              )}
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
                <p>Clique em <strong>Consultar Hoje</strong> para buscar os pagamentos do dia no Autolac.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Nenhum pagamento encontrado para hoje.</p>
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
                            disabled={row._nfseStatus === "success"}
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
                        <TableCell>
                          <NfseStatusBadge row={row} ambiente={ambiente} onDownloadPdf={downloadDanfse} />
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
