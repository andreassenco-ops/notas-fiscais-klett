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
import { Loader2, Search, FileText, Download, Send, CheckCircle2, XCircle, AlertTriangle, FileDown, CalendarIcon, Filter, Save, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotaFiscalRow {
  PROTOCOLOC: string;
  GUIA_ID: number | null;
  "DATA DO PAGAMENTO": string;
  CONVENIO: string;
  NOME: string;
  CPF: string;
  OBSERVAÇÃO: string;
  RECIBO: string;
  "FORMA DE PAGAMENTO": string;
  "VALOR TOTAL DO PAGAMENTO": number | null;
  DESCRICAO_EXAMES: string | null;
  [key: string]: unknown;
  // NFS-e state (client-side only)
  _nfseStatus?: "pending" | "emitting" | "success" | "error" | "already_emitted";
  _nfseChave?: string;
  _nfseNumero?: string;
  _nfseError?: string;
  _nfsePdfUrl?: string;
}

function buildQuery(dateFrom: string, dateTo: string): string {
  return `SELECT 
  SOLICITACAO.LOCAL + '-' + RIGHT('000000' + CAST(SOLICITACAO.PROTOCOLO AS VARCHAR), 6) AS PROTOCOLOC,
  SOLICITACAO_GUIA.ID AS GUIA_ID,
  PAG_INFO.DATA_PAG AS [DATA DO PAGAMENTO],
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI [OBSERVAÇÃO],
  ISNULL(SOLICITACAO.OBS_RECIBO, '') AS RECIBO,
  'REEMBOLSO' AS [FORMA DE PAGAMENTO],
  SUM(SOLICITACAO_EXAMES_GUIA.VALOR) [VALOR TOTAL DO PAGAMENTO],
  STUFF((
    SELECT ', ' + SEG2.DESCRICAO
    FROM SOLICITACAO_EXAMES_GUIA SEG2
    WHERE SEG2.SOLICITACAO_GUIA_ID = SOLICITACAO_GUIA.ID
    ORDER BY SEG2.ID
    FOR XML PATH(''), TYPE
  ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS DESCRICAO_EXAMES
FROM SOLICITACAO
INNER JOIN SOLICITACAO_GUIA ON SOLICITACAO_GUIA.SOLICITACAO_ID = SOLICITACAO.ID
INNER JOIN SOLICITACAO_EXAMES_GUIA ON SOLICITACAO_EXAMES_GUIA.SOLICITACAO_GUIA_ID = SOLICITACAO_GUIA.ID
INNER JOIN PACIENTE ON (PACIENTE.ID = SOLICITACAO.PACIENTE)
INNER JOIN LOCAL ON (LOCAL.ID = SOLICITACAO.LOCAL)
CROSS APPLY (
  SELECT TOP 1 CONVERT(VARCHAR(10), SP.DATA, 23) AS DATA_PAG
  FROM SOLICITACAO_PAGAMENTOS SP
  INNER JOIN SOLICITACAO_GUIA SG2 ON SG2.ID = SP.SOLICITACAO_GUIA_ID
  WHERE SG2.SOLICITACAO_ID = SOLICITACAO.ID
    AND UPPER(LTRIM(RTRIM(SP.FORMA_PAGAMENTO))) = 'REEMBOLSO'
  ORDER BY SP.DATA DESC
) PAG_INFO
WHERE PAG_INFO.DATA_PAG BETWEEN '${dateFrom}' AND '${dateTo}'
  AND SOLICITACAO.LOCAL != '09'
GROUP BY SOLICITACAO.LOCAL, SOLICITACAO.PROTOCOLO,
  SOLICITACAO_GUIA.ID,
  PAG_INFO.DATA_PAG,
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI,
  SOLICITACAO.OBS_RECIBO

UNION ALL

SELECT 
  SOLICITACAO.LOCAL + '-' + RIGHT('000000' + CAST(SOLICITACAO.PROTOCOLO AS VARCHAR), 6) AS PROTOCOLOC,
  NULL AS GUIA_ID,
  CONVERT(VARCHAR(10), SOLICITACAO_PAGAMENTOS.DATA, 23) AS [DATA DO PAGAMENTO],
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI [OBSERVAÇÃO],
  ISNULL(SOLICITACAO.OBS_RECIBO, '') AS RECIBO,
  UPPER(LTRIM(RTRIM(SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO))) [FORMA DE PAGAMENTO],
  SUM(SOLICITACAO_PAGAMENTOS.VALOR) [VALOR TOTAL DO PAGAMENTO],
  NULL AS DESCRICAO_EXAMES
FROM SOLICITACAO
INNER JOIN SOLICITACAO_GUIA ON SOLICITACAO_GUIA.SOLICITACAO_ID = SOLICITACAO.ID
INNER JOIN SOLICITACAO_PAGAMENTOS ON SOLICITACAO_GUIA.ID = SOLICITACAO_PAGAMENTOS.SOLICITACAO_GUIA_ID
INNER JOIN PACIENTE ON (PACIENTE.ID = SOLICITACAO.PACIENTE)
INNER JOIN LOCAL ON (LOCAL.ID = SOLICITACAO.LOCAL)
WHERE SOLICITACAO_PAGAMENTOS.DATA BETWEEN '${dateFrom}' AND '${dateTo}'
  AND SOLICITACAO.LOCAL != '09'
  AND UPPER(LTRIM(RTRIM(SOLICITACAO_PAGAMENTOS.FORMA_PAGAMENTO))) != 'REEMBOLSO'
GROUP BY SOLICITACAO.LOCAL, SOLICITACAO.PROTOCOLO,
  CONVERT(VARCHAR(10), SOLICITACAO_PAGAMENTOS.DATA, 23),
  SOLICITACAO_GUIA.CONVENIO,
  PACIENTE.NOME,
  PACIENTE.CPF,
  PACIENTE.NOME_PAI,
  SOLICITACAO.OBS_RECIBO,
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
  const [availablePaymentTypes, setAvailablePaymentTypes] = useState<string[]>([]);
  const [excludedPaymentTypes, setExcludedPaymentTypes] = useState<Set<string>>(new Set(["DINHEIRO", "DINHEIROTOX", "CARTAO CREDITO TOX"]));
  const [paymentFilterOpen, setPaymentFilterOpen] = useState(false);
  
  // Default to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [dateFrom, setDateFrom] = useState<Date>(yesterday);
  const [dateTo, setDateTo] = useState<Date>(yesterday);
  const [observacoes, setObservacoes] = useState<Map<string, string>>(new Map());
  const [savingObs, setSavingObs] = useState<Set<string>>(new Set());
  const [sortByValue, setSortByValue] = useState<"asc" | "desc" | null>(null);

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
    const dateFromStr = format(dateFrom, "yyyy-MM-dd");
    const dateToStr = format(dateTo, "yyyy-MM-dd");
    try {
      const { data: result, error } = await supabase.functions.invoke('test-sql-query', {
        body: { sql_query: buildQuery(dateFromStr, dateToStr), limit: 1000 },
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
      
      // Extract unique payment types
      const paymentTypes = [...new Set(rawRows.map(r => r["FORMA DE PAGAMENTO"]).filter(Boolean))].sort();
      setAvailablePaymentTypes(paymentTypes);

      // Fetch already-emitted notes from database
      if (rawRows.length > 0) {
        const protocolos = rawRows.map(r => r.PROTOCOLOC);
        const { data: emitidas } = await supabase
          .from('nfse_emitidas')
          .select('protocolo, chave_acesso, numero_nota, ndps, observacao')
          .in('protocolo', protocolos);
        
        if (emitidas && emitidas.length > 0) {
          const dbStore = new Map<string, NfseState>();
          const obsMap = new Map<string, string>();
          for (const e of emitidas) {
            dbStore.set(e.protocolo, {
              status: "success",
              chave: e.chave_acesso || undefined,
              numero: e.numero_nota || e.ndps || undefined,
            });
            if (e.observacao) obsMap.set(e.protocolo, e.observacao);
          }
          setObservacoes((prev) => {
            const next = new Map(prev);
            obsMap.forEach((v, k) => next.set(k, v));
            return next;
          });
          setNfseStore((prev) => {
            const next = new Map(prev);
            dbStore.forEach((v, k) => next.set(k, v));
            return next;
          });
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
      toast.success(`${rawRows.length} registros encontrados`);
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

  // Apply payment type filter, then text search, then sort
  const paymentFilteredRows = rows.filter(
    (row) => !excludedPaymentTypes.has(row["FORMA DE PAGAMENTO"])
  );

  const textFilteredRows = searchTerm
    ? paymentFilteredRows.filter((row) =>
        Object.values(row).some(
          (val) =>
            val &&
            typeof val === "string" &&
            val.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : paymentFilteredRows;

  const filteredRows = sortByValue
    ? [...textFilteredRows].sort((a, b) => {
        const va = Number(a["VALOR TOTAL DO PAGAMENTO"]) || 0;
        const vb = Number(b["VALOR TOTAL DO PAGAMENTO"]) || 0;
        return sortByValue === "asc" ? va - vb : vb - va;
      })
    : textFilteredRows;

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
        cpf: r.RECIBO && r.RECIBO.trim() ? r.RECIBO.replace(/\D/g, "") : String(r.CPF).replace(/\D/g, ""),
        valor: Number(r["VALOR TOTAL DO PAGAMENTO"]),
        formaPagamento: r["FORMA DE PAGAMENTO"],
        dataAtendimento: String(r["DATA DO PAGAMENTO"] || ""),
        descricaoServico: r.DESCRICAO_EXAMES || undefined,
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
              // Número oficial exibido no portal nacional: nNFSe
              numero: match.nNFSe || match.nDFSe || match.nDPS,
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
          // Persistir nNFSe para manter alinhado com o número da nota exibido no portal
          numero_nota: r.nNFSe || r.nDFSe || null,
          ndps: r.nDPS || null,
          valor: r.dados?.valor || null,
          paciente_nome: r.dados?.pacienteNome || null,
          cpf: r.dados?.cpf || null,
        }));
        await supabase.from('nfse_emitidas').upsert(dbRows, { onConflict: 'protocolo' });

        // Auto-enqueue WhatsApp messages for successful emissions with chave
        const whatsappItems = successResults
          .filter((r: any) => r.chNFSe)
          .map((r: any) => ({
            protocolo: r.protocolo,
            pacienteNome: r.dados?.pacienteNome || '',
            cpf: r.dados?.cpf || '',
            valor: Number(r.dados?.valor || 0),
            chaveAcesso: r.chNFSe,
          }));

        if (whatsappItems.length > 0) {
          try {
            const enqueueResult = await api.enqueueNfseWhatsapp(whatsappItems);
            const enqueued = enqueueResult.enqueued || 0;
            const noPhone = enqueueResult.results?.filter((r: any) => !r.success && r.error?.includes('Telefone')).length || 0;
            if (enqueued > 0) {
              toast.success(`${enqueued} NFS-e(s) enfileirada(s) para envio via WhatsApp`);
            }
            if (noPhone > 0) {
              toast.warning(`${noPhone} nota(s) sem telefone encontrado`);
            }
          } catch (enqErr) {
            console.warn('Erro ao enfileirar WhatsApp NFS-e:', enqErr);
            toast.warning('NFS-e emitida, mas falha ao enfileirar WhatsApp');
          }
        }
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

  const saveObservacao = async (protocolo: string, obs: string) => {
    setSavingObs((prev) => new Set(prev).add(protocolo));
    try {
      // Upsert into nfse_emitidas with just observacao
      await supabase.from('nfse_emitidas').upsert(
        { protocolo, observacao: obs || null },
        { onConflict: 'protocolo' }
      );
      setObservacoes((prev) => {
        const next = new Map(prev);
        next.set(protocolo, obs);
        return next;
      });
      toast.success("Observação salva");
    } catch {
      toast.error("Erro ao salvar observação");
    } finally {
      setSavingObs((prev) => {
        const next = new Set(prev);
        next.delete(protocolo);
        return next;
      });
    }
  };

  const exportCSV = () => {
    if (!filteredRows.length) return;
    const displayCols = [
      "PROTOCOLOC", "DATA DO PAGAMENTO", "CONVENIO", "NOME", "CPF", "RECIBO",
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
              Consulta de pagamentos por período e emissão de NFS-e Nacional
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Data inicial</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-40 justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateFrom, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => {
                      if (d) {
                        setDateFrom(d);
                        if (d > dateTo) setDateTo(d);
                      }
                    }}
                    locale={ptBR}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Data final</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-40 justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateTo, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(d) => {
                      if (d) {
                        if (d < dateFrom) setDateFrom(d);
                        setDateTo(d);
                      }
                    }}
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

        {/* Payment Type Filter */}
        {hasQueried && availablePaymentTypes.length > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  Formas de pagamento:
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setExcludedPaymentTypes(new Set())}
                  >
                    Marcar todos
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setExcludedPaymentTypes(new Set(availablePaymentTypes))}
                  >
                    Desmarcar todos
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {availablePaymentTypes.map((type) => {
                  const isIncluded = !excludedPaymentTypes.has(type);
                  const count = rows.filter(r => r["FORMA DE PAGAMENTO"] === type).length;
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setExcludedPaymentTypes((prev) => {
                          const next = new Set(prev);
                          if (next.has(type)) next.delete(type);
                          else next.add(type);
                          return next;
                        });
                        setSelectedRows(new Set());
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                        isIncluded
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border line-through opacity-60"
                      )}
                    >
                      {type} ({count})
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {hasQueried && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Protocolos</div>
                <div className="text-2xl font-bold text-foreground">
                  {filteredRows.length}
                  {filteredRows.length !== rows.length && (
                    <span className="text-sm font-normal text-muted-foreground ml-1">/ {rows.length} total</span>
                  )}
                </div>
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
                <p>Nenhum pagamento encontrado para o período selecionado.</p>
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
                      <TableHead className="w-36">NF p/ Terceiro</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Forma Pgto</TableHead>
                      <TableHead>Descrição Serviço</TableHead>
                      <TableHead className="text-right w-32 cursor-pointer select-none" onClick={() => {
                        setSortByValue(prev => prev === null ? "desc" : prev === "desc" ? "asc" : null);
                        setSelectedRows(new Set());
                      }}>
                        <span className="inline-flex items-center gap-1">
                          Valor Total
                          {sortByValue === "desc" ? <ArrowDown className="h-3 w-3" /> : sortByValue === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </span>
                      </TableHead>
                      <TableHead className="w-24">Nº Nota</TableHead>
                      <TableHead>NFS-e</TableHead>
                      <TableHead className="w-48">Observação</TableHead>
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
                        <TableCell className="font-mono text-sm">
                          {row.RECIBO && row.RECIBO.trim() ? (
                            <span className="text-primary font-medium" title="NFS-e será emitida para este CPF">
                              {formatCPF(row.RECIBO.trim())}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs whitespace-nowrap">
                            {row.CONVENIO || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row["FORMA DE PAGAMENTO"] || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={row.DESCRICAO_EXAMES || ""}>
                          {row.DESCRICAO_EXAMES || "—"}
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
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              key={`obs-${row.PROTOCOLOC}-${observacoes.get(row.PROTOCOLOC) || ""}`}
                              className="h-7 text-xs min-w-[120px]"
                              placeholder="Obs..."
                              defaultValue={observacoes.get(row.PROTOCOLOC) || ""}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (observacoes.get(row.PROTOCOLOC) || "")) {
                                  saveObservacao(row.PROTOCOLOC, val);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              disabled={savingObs.has(row.PROTOCOLOC)}
                            />
                            {savingObs.has(row.PROTOCOLOC) && <Loader2 className="h-3 w-3 animate-spin" />}
                          </div>
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
