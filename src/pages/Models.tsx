import { useNavigate } from "react-router-dom";
import { FileText, Edit2, Power, PowerOff } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useModels, useUpdateModel } from "@/hooks/useModels";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Models() {
  const navigate = useNavigate();
  const { data: models, isLoading } = useModels();
  const updateModel = useUpdateModel();

  const handleToggle = (id: number, isActive: boolean) => {
    updateModel.mutate({ id, updates: { is_active: isActive } });
  };

  const activeCount = models?.filter((m) => m.is_active).length || 0;

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Modelos</h1>
          <p className="text-muted-foreground mt-1">
            Configure os modelos de envio automático com suas consultas SQL e variações de mensagem
          </p>
          <div className="flex gap-2 mt-3">
            <Badge variant="default" className="gap-1">
              <Power className="h-3 w-3" />
              {activeCount} ativos
            </Badge>
            <Badge variant="outline" className="gap-1">
              <PowerOff className="h-3 w-3" />
              {(models?.length || 0) - activeCount} inativos
            </Badge>
          </div>
        </div>

        {/* Models Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Modelos</CardTitle>
            <CardDescription>
              Clique em Editar para configurar a consulta SQL e as variações de mensagem
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-32">Consulta SQL</TableHead>
                    <TableHead className="w-32">Intervalo</TableHead>
                    <TableHead className="w-24 text-center">Status</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models?.map((model) => (
                    <TableRow
                      key={model.id}
                      className={cn(!model.is_active && "opacity-50")}
                    >
                      <TableCell className="font-mono text-muted-foreground">
                        {model.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "p-2 rounded-lg",
                              model.is_active ? "bg-primary/10" : "bg-muted"
                            )}
                          >
                            <FileText
                              className={cn(
                                "h-4 w-4",
                                model.is_active
                                  ? "text-primary"
                                  : "text-muted-foreground"
                              )}
                            />
                          </div>
                          <span className="font-medium">{model.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {model.sql_query ? (
                          <Badge variant="secondary" className="text-xs">
                            Configurada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Não configurada
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {model.query_interval_minutes} min
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={model.is_active}
                          onCheckedChange={(checked) =>
                            handleToggle(model.id, checked)
                          }
                          disabled={updateModel.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/models/${model.id}`)}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
