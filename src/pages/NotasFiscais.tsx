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
import { Loader2, Search, FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
WHERE SOLICITACAO_PAGAMENTOS.DATA BETWEEN CAST(GETDATE() AS DATE) AND CAST(GETDATE() AS DATE)
GROUP BY SOLICITACAO.LOCAL, SOLICITACAO.PROTOCOLO,
  SOLICITACAO_PAGAMENTOS.DATA,
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI,
  SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO,
  SOLICITACAO_PAGAMENTOS.VALOR`;
}

export default function NotasFiscais() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<NotaFiscalRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasQueried, setHasQueried] = useState(false);

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
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : rows;

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

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Notas Fiscais
            </h1>
            <p className="text-muted-foreground mt-1">
              Consulta de pagamentos do dia — 1 linha por protocolo
            </p>
          </div>
          <div className="flex gap-2">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
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
                      <TableHead className="w-28">Protocolo</TableHead>
                      <TableHead className="w-24">Data Pgto</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="w-36">CPF</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Forma Pgto</TableHead>
                      <TableHead className="text-right w-32">Valor Total</TableHead>
                      <TableHead>Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, idx) => (
                      <TableRow key={idx}>
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
                        <TableCell className="text-sm max-w-[150px] truncate" title={row["OBSERVAÇÃO"] || ""}>
                          {row["OBSERVAÇÃO"] || "—"}
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
