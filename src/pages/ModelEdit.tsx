import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Play,
  Plus,
  Trash2,
  MessageSquare,
  Database,
  Clock,
  Settings2,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useModel,
  useModelMessages,
  useUpdateModel,
  useUpsertModelMessage,
  useToggleModelMessage,
  useDeleteModelMessage,
} from "@/hooks/useModels";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface QueryTestResult {
  success: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  totalRowCount?: number;
  error?: string;
  executionTime?: number;
}

export default function ModelEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const modelId = parseInt(id || "0", 10);

  const { data: model, isLoading: modelLoading } = useModel(modelId);
  const { data: messages, isLoading: messagesLoading } = useModelMessages(modelId);
  const updateModel = useUpdateModel();
  const upsertMessage = useUpsertModelMessage();
  const toggleMessage = useToggleModelMessage();
  const deleteMessage = useDeleteModelMessage();

  // Local state for editing
  const [name, setName] = useState("");
  const [sqlQuery, setSqlQuery] = useState("");
  const [queryInterval, setQueryInterval] = useState(60);
  const [delayMin, setDelayMin] = useState(40);
  const [delayMax, setDelayMax] = useState(100);
  const [newMessageBody, setNewMessageBody] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageBody, setEditingMessageBody] = useState("");
  const [testResult, setTestResult] = useState<QueryTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testLimit, setTestLimit] = useState(10);
  const [includeTotal, setIncludeTotal] = useState(true);

  // Sync local state with fetched model
  useEffect(() => {
    if (model) {
      setName(model.name);
      setSqlQuery(model.sql_query || "");
      setQueryInterval(model.query_interval_minutes);
      setDelayMin(model.delay_min_seconds);
      setDelayMax(model.delay_max_seconds);
    }
  }, [model]);

  const handleSaveModel = () => {
    updateModel.mutate({
      id: modelId,
      updates: {
        name,
        sql_query: sqlQuery || null,
        query_interval_minutes: queryInterval,
        delay_min_seconds: delayMin,
        delay_max_seconds: delayMax,
      },
    });
  };

  const handleTestQuery = async () => {
    if (!sqlQuery.trim()) {
      toast.error("Consulta SQL vazia");
      return;
    }

    const trimmed = sqlQuery.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT")) {
      toast.error("Apenas consultas SELECT são permitidas");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("test-sql-query", {
        body: { sql_query: sqlQuery, limit: testLimit, include_total: includeTotal },
      });

      if (error) {
        setTestResult({
          success: false,
          error: error.message || "Erro ao testar consulta",
        });
        toast.error("Erro ao testar consulta");
      } else {
        setTestResult(data as QueryTestResult);
        if (data.success) {
          toast.success("Consulta validada com sucesso");
        } else {
          toast.error(data.error || "Erro na consulta");
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
      toast.error("Erro ao conectar com o servidor");
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddMessage = () => {
    if (!newMessageBody.trim()) {
      toast.error("Digite o texto da mensagem");
      return;
    }

    const nextIndex = (messages?.length || 0) + 1;
    if (nextIndex > 15) {
      toast.error("Máximo de 15 mensagens por modelo");
      return;
    }

    upsertMessage.mutate({
      modelId,
      messageIndex: nextIndex,
      body: newMessageBody.trim(),
    });
    setNewMessageBody("");
  };

  const handleSaveEditMessage = (id: string, messageIndex: number) => {
    if (!editingMessageBody.trim()) {
      toast.error("Texto da mensagem não pode ser vazio");
      return;
    }

    upsertMessage.mutate({
      modelId,
      messageIndex,
      body: editingMessageBody.trim(),
    });
    setEditingMessageId(null);
    setEditingMessageBody("");
  };

  const handleDeleteMessage = (id: string) => {
    deleteMessage.mutate({ id, modelId });
  };

  const handleToggleMessage = (id: string, isActive: boolean) => {
    toggleMessage.mutate({ id, modelId, isActive });
  };

  const extractVariables = (text: string) => {
    const matches = text.match(/\[\[([^\]]+)\]\]/g);
    return matches ? [...new Set(matches.map((m) => m.slice(2, -2)))] : [];
  };

  const activeMessagesCount = messages?.filter((m) => m.is_active).length || 0;

  if (modelLoading || messagesLoading) {
    return (
      <MainLayout>
        <div className="animate-fade-in space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!model) {
    return (
      <MainLayout>
        <div className="animate-fade-in text-center py-12">
          <h2 className="text-xl font-semibold">Modelo não encontrado</h2>
          <Button className="mt-4" onClick={() => navigate("/models")}>
            Voltar para Modelos
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/models")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">
              Editar Modelo #{modelId}
            </h1>
            <p className="text-muted-foreground">{model.name}</p>
          </div>
          <Button onClick={handleSaveModel} disabled={updateModel.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
        </div>

        {/* Model Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Configurações do Modelo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div>
              <Label>Nome do Modelo</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 max-w-md"
              />
            </div>

            {/* Delays */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
              <div>
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Delay Mínimo (segundos)
                </Label>
                <Input
                  type="number"
                  value={delayMin}
                  onChange={(e) => setDelayMin(Number(e.target.value))}
                  min={10}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Delay Máximo (segundos)
                </Label>
                <Input
                  type="number"
                  value={delayMax}
                  onChange={(e) => setDelayMax(Number(e.target.value))}
                  min={delayMin}
                  className="mt-1.5"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Intervalo aleatório entre {delayMin}s e {delayMax}s entre cada mensagem enviada
            </p>
          </CardContent>
        </Card>

        {/* SQL Query */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Consulta SQL
            </CardTitle>
            <CardDescription>
              Consulta executada no SQL Server Autolac a cada {queryInterval} minutos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Intervalo de Consulta (minutos)</Label>
              <Input
                type="number"
                value={queryInterval}
                onChange={(e) => setQueryInterval(Number(e.target.value))}
                min={1}
                className="mt-1.5 w-32"
              />
            </div>

            <div>
              <Label>Consulta SQL</Label>
              <Textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={8}
                placeholder={`SELECT 
  paciente_nome AS NOME,
  telefone AS TELEFONE,
  protocolo AS PROTOCOLO,
  ...
FROM view_resultados
WHERE status = 'PENDENTE'`}
                className="mt-1.5 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Os nomes das colunas (aliases) devem corresponder às variáveis [[VARIAVEL]] nas
                mensagens
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={handleTestQuery}
                disabled={isTesting || !sqlQuery}
              >
                <Play className="h-4 w-4 mr-2" />
                {isTesting ? "Testando..." : "Testar Consulta"}
              </Button>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Prévia</Label>
                <Input
                  type="number"
                  value={testLimit}
                  onChange={(e) => setTestLimit(Math.max(1, Math.min(500, Number(e.target.value) || 10)))}
                  min={1}
                  max={500}
                  className="w-24"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={includeTotal} onCheckedChange={setIncludeTotal} />
                <span className="text-xs text-muted-foreground">Calcular total</span>
              </div>
            </div>

            {testResult && (
              <div className={cn(
                "p-4 rounded-lg border",
                testResult.success ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
              )}>
                <div className="flex items-center gap-2 mb-3">
                  {testResult.success ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-700 dark:text-green-400">Consulta Válida</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="font-medium text-red-700 dark:text-red-400">Erro na Consulta</span>
                    </>
                  )}
                </div>

                {testResult.error && (
                  <p className="text-sm text-red-600 dark:text-red-400 mb-3">{testResult.error}</p>
                )}

                {testResult.columns && testResult.columns.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Colunas detectadas na consulta:</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {testResult.columns.map((col) => (
                          <Badge key={col} variant="secondary" className="font-mono text-xs">
                            [[{col}]]
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      Use estas variáveis nas mensagens. O Worker executará a consulta real no SQL Server Autolac.
                    </p>

                    {testResult.rows && testResult.rows.length > 0 && (
                      <div className="mt-4">
                        <Label className="text-xs text-muted-foreground mb-2 block">Prévia dos resultados:</Label>
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {testResult.columns.map((col) => (
                                  <TableHead key={col} className="text-xs font-mono">
                                    {col}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {testResult.rows.map((row, idx) => (
                                <TableRow key={idx}>
                                  {testResult.columns!.map((col) => (
                                    <TableCell key={col} className="text-xs">
                                      {String(row[col] ?? row[col.toLowerCase()] ?? "-")}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {(testResult.rowCount !== undefined || testResult.totalRowCount !== undefined) && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {testResult.totalRowCount !== undefined
                              ? `Total no banco: ${testResult.totalRowCount} • Prévia: ${testResult.rowCount ?? 0}`
                              : `Prévia: ${testResult.rowCount} registros`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Variações de Mensagem
            </CardTitle>
            <CardDescription>
              Configure até 15 variações. Uma será escolhida aleatoriamente para cada envio,
              evitando bloqueio do WhatsApp.
            </CardDescription>
            <div className="flex gap-2 mt-2">
              <Badge variant="default">{activeMessagesCount} ativas</Badge>
              <Badge variant="outline">
                {(messages?.length || 0) - activeMessagesCount} inativas
              </Badge>
              <Badge variant="secondary">{15 - (messages?.length || 0)} disponíveis</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing messages */}
            {messages?.map((msg) => {
              const isEditing = editingMessageId === msg.id;
              const variables = extractVariables(msg.body);

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "p-4 rounded-lg border",
                    msg.is_active ? "bg-card" : "bg-muted/30 opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">
                        #{msg.message_index}
                      </Badge>
                      <Switch
                        checked={msg.is_active}
                        onCheckedChange={(checked) =>
                          handleToggleMessage(msg.id, checked)
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleSaveEditMessage(msg.id, msg.message_index)
                            }
                            disabled={upsertMessage.isPending}
                          >
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingMessageBody("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingMessageBody(msg.body);
                            }}
                          >
                            Editar
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover mensagem?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteMessage(msg.id)}
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    {isEditing ? (
                      <Textarea
                        value={editingMessageBody}
                        onChange={(e) => setEditingMessageBody(e.target.value)}
                        rows={4}
                        className="font-mono text-sm"
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-whatsapp/5 border border-whatsapp/20 text-sm whitespace-pre-wrap">
                        {msg.body}
                      </div>
                    )}
                  </div>

                  {variables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {variables.map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs">
                          [[{v}]]
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add new message */}
            {(messages?.length || 0) < 15 && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <Label>Adicionar Nova Mensagem</Label>
                  <Textarea
                    value={newMessageBody}
                    onChange={(e) => setNewMessageBody(e.target.value)}
                    rows={4}
                    placeholder="Olá [[NOME]], sua mensagem aqui..."
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={handleAddMessage}
                    disabled={upsertMessage.isPending || !newMessageBody.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Mensagem #{(messages?.length || 0) + 1}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
