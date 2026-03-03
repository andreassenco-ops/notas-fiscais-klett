import { useState } from "react";
import { Search, Filter, RefreshCw } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueueTable, QueueItem } from "@/components/dashboard/QueueTable";
import { useSendQueue, useResendMessage, SendStatus } from "@/hooks/useSendQueue";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentPhones, normalizePhoneSuffix } from "@/hooks/useSentPhones";

const PAGE_SIZE = 50;

export default function Queue() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const status = activeTab === "all" ? undefined : (activeTab.toUpperCase() as SendStatus);
  
  const { data: queueData, isLoading, refetch } = useSendQueue({
    status,
    search: search || undefined,
    page: currentPage,
    pageSize: PAGE_SIZE,
  });

  const { data: sentPhones } = useSentPhones();
  const resendMessage = useResendMessage();

  const handleResend = (id: string) => {
    resendMessage.mutate(id);
  };

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
          <h1 className="text-2xl font-bold text-foreground">Fila de Envios</h1>
          <p className="text-muted-foreground mt-1">
            Visualize e gerencie todos os envios pendentes e realizados
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por protocolo, CPF ou nome..."
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
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="sent">Enviados</TabsTrigger>
            <TabsTrigger value="error">Erros</TabsTrigger>
            <TabsTrigger value="skipped">Ignorados</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {isLoading ? (
              <Skeleton className="h-96" />
            ) : (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  {queueData?.totalCount ?? 0} registro(s) • Página {currentPage} de {queueData?.totalPages || 1}
                </div>
                <QueueTable
                  items={(queueData?.items ?? []).map(item => {
                    const phoneSuffix = normalizePhoneSuffix(item.phone);
                    const deliveredViaLog = sentPhones?.has(phoneSuffix) ?? false;
                    return {
                      ...item,
                      variables: item.variables,
                      result_link: item.result_link,
                      deliveredViaLog,
                    };
                  }) as QueueItem[]}
                  onResend={handleResend}
                  isLoading={resendMessage.isPending}
                  currentPage={currentPage}
                  totalPages={queueData?.totalPages ?? 1}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
