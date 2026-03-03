import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface NotaFiscalRow {
  PROTOCOLO: string;
  DATA: string;
  NOME: string;
  CPF: string;
  CELULAR: string;
  EMAIL: string;
  VALOR: number | null;
  CONVENIO: string;
  PLANO: string;
  UNIDADE: string;
  FORMA_ENTREGA: string | number | null;
  EXAMES: string;
  [key: string]: unknown;
}

const DEFAULT_QUERY = `SELECT 
  RTRIM(R.LOCAL) + '-' + CAST(R.PROTOCOLO AS VARCHAR) AS PROTOCOLO,
  R.DATA,
  P.NOME,
  REPLACE(REPLACE(P.CPF, '.', ''), '-', '') AS CPF,
  P.CELULAR,
  P.EMAIL,
  R.TOTAL AS VALOR,
  R.CONVENIO,
  R.PLANO,
  L.DESCRICAO AS UNIDADE,
  R.FORMA_ENTREGA,
  R.EXAMES
FROM REQUISICAO R
INNER JOIN PACIENTE P ON R.PACIENTE = P.ID
INNER JOIN LOCAL L ON R.LOCAL = L.ID
WHERE CAST(R.DATA AS DATE) = CAST(GETDATE() AS DATE)
  AND R.TOTAL > 0
ORDER BY R.PROTOCOLO`;

export default function NotasFiscais() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<NotaFiscalRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasQueried, setHasQueried] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    try {
      const result = await api.testSqlQuery(DEFAULT_QUERY, 500) as {
        columns?: string[];
        rows?: NotaFiscalRow[];
        rowCount?: number;
        totalCount?: number;
      };

      if (result.columns) setColumns(result.columns);
      if (result.rows) setRows(result.rows);
      setTotalCount(result.totalCount || result.rowCount || result.rows?.length || 0);
      setHasQueried(true);
      toast.success(`${result.rows?.length || 0} registros encontrados`);
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
    if (!cpf || cpf.length !== 11) return cpf;
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  };

  const exportCSV = () => {
    if (!filteredRows.length) return;
    const displayCols = ["PROTOCOLO", "DATA", "NOME", "CPF", "CELULAR", "EMAIL", "VALOR", "CONVENIO", "PLANO", "UNIDADE", "FORMA_ENTREGA", "EXAMES"];
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
    const val = Number(row.VALOR);
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
              Consulta de atendimentos e faturamento do dia
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total de Atendimentos</div>
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
                <div className="text-sm text-muted-foreground">Total Geral (banco)</div>
                <div className="text-2xl font-bold text-foreground">{totalCount}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Atendimentos do Dia</CardTitle>
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
                <p>Clique em <strong>Consultar Hoje</strong> para buscar os atendimentos do dia no Autolac.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Nenhum atendimento encontrado.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Protocolo</TableHead>
                      <TableHead className="w-24">Data</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="w-36">CPF</TableHead>
                      <TableHead className="w-32">Celular</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right w-28">Valor</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Forma Pgto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm font-medium">
                          {row.PROTOCOLO}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {row.DATA ? new Date(String(row.DATA)).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {row.NOME}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCPF(String(row.CPF || ""))}
                        </TableCell>
                        <TableCell className="text-sm">{row.CELULAR || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">
                          {row.EMAIL || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(row.VALOR)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs whitespace-nowrap">
                            {row.CONVENIO || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{row.PLANO || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {row.UNIDADE || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {String(row.FORMA_ENTREGA ?? "—")}
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
