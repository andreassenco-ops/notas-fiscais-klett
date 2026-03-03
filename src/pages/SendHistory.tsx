import { useState } from "react";
import { Search, Filter, RefreshCw, History, CheckCircle2, XCircle, TestTube } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useHistoricalSends, useHistoricalStats, HistoricalSend } from "@/hooks/useHistoricalSends";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PAGE_SIZE = 50;

function maskCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `***.***.${digits.slice(6, 9)}-**`;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}

const statusConfig = {
  SENT: {
    label: "Enviado",
    className: "bg-green-500/10 text-green-600",
    icon: CheckCircle2,
  },
  TEST_SENT: {
    label: "Teste",
    className: "bg-blue-500/10 text-blue-600",
    icon: TestTube,
  },
  ERROR: {
    label: "Erro",
    className: "bg-destructive/10 text-destructive",
    icon: XCircle,
  },
};

function HistoryRow({ item }: { item: HistoricalSend }) {
  const config = statusConfig[item.status];
  const StatusIcon = config.icon;

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        {format(new Date(item.sent_at), "dd/MM/yy HH:mm", { locale: ptBR })}
      </TableCell>
      <TableCell className="font-medium">{item.patient_name}</TableCell>
      <TableCell className="font-mono text-sm">{maskCPF(item.cpf)}</TableCell>
      <TableCell className="font-mono text-sm">{formatPhone(item.phone)}</TableCell>
      <TableCell className="font-mono text-xs">{item.protocol}</TableCell>
      <TableCell>
        {item.model_name && (
          <Badge variant="outline" className="text-xs">
            {item.model_name}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge className={config.className}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
          {item.source === "log" && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              log
            </Badge>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function SendHistory() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const status = activeTab === "all" ? "all" : (activeTab.toUpperCase() as "SENT" | "ERROR");

  const { data: historyData, isLoading, refetch } = useHistoricalSends({
    search: search || undefined,
    page: currentPage,
    pageSize: PAGE_SIZE,
    status,
  });

  const { data: stats } = useHistoricalStats();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    refetch();
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Histórico de Envios</h1>
              <p className="text-muted-foreground">
                Registro completo de todas as mensagens enviadas
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Mensagens</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalMessages ?? "-"}</div>
              <p className="text-xs text-muted-foreground">desde o início</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Contatos Únicos</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.uniqueContacts ?? "-"}</div>
              <p className="text-xs text-muted-foreground">pacientes contactados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Envios Produção</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.sentMessages ?? "-"}</div>
              <p className="text-xs text-muted-foreground">mensagens enviadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Envios Teste</CardTitle>
              <TestTube className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.testMessages ?? "-"}</div>
              <p className="text-xs text-muted-foreground">mensagens de teste</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por protocolo, CPF, nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              <Filter className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
          </form>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="sent">Enviados</TabsTrigger>
            <TabsTrigger value="error">Erros</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {isLoading ? (
              <Skeleton className="h-96" />
            ) : (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  {historyData?.totalCount ?? 0} registro(s) • Página {currentPage} de{" "}
                  {historyData?.totalPages || 1}
                </div>

                {historyData?.items.length === 0 ? (
                  <Card className="py-12">
                    <CardContent className="flex flex-col items-center justify-center text-center">
                      <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground">
                        Nenhum registro encontrado
                      </h3>
                      <p className="text-sm text-muted-foreground/70 mt-1">
                        O histórico de envios aparecerá aqui quando mensagens forem enviadas.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Data/Hora</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead className="w-[130px]">CPF</TableHead>
                          <TableHead className="w-[160px]">Telefone</TableHead>
                          <TableHead className="w-[100px]">Protocolo</TableHead>
                          <TableHead className="w-[100px]">Modelo</TableHead>
                          <TableHead className="w-[140px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyData?.items.map((item) => (
                          <HistoryRow key={item.id} item={item} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Pagination */}
                {historyData && historyData.totalPages > 1 && (
                  <div className="mt-4">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, historyData.totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (historyData.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= historyData.totalPages - 2) {
                            pageNum = historyData.totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => setCurrentPage(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              setCurrentPage((p) => Math.min(historyData.totalPages, p + 1))
                            }
                            className={
                              currentPage === historyData.totalPages
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
