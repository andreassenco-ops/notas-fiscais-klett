import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Trash2, Send, MessageSquare, Plug, CheckCircle2, XCircle, Loader2, QrCode } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWhatsAppSession, useUpdateWhatsAppSession } from "@/hooks/useWhatsAppSession";
import { useWhatsAppWorkerStatus } from "@/hooks/useWhatsAppWorkerStatus";
import { deriveStatusFromWorker, useEffectiveWhatsAppStatus } from "@/hooks/useEffectiveWhatsAppStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ConnectionStep = "idle" | "testing" | "test_success" | "test_error" | "generating" | "waiting_scan";

export default function WhatsAppConnection() {
  const { data: session, isLoading, refetch } = useWhatsAppSession();
  const updateSession = useUpdateWhatsAppSession();
  const workerStatusQuery = useWhatsAppWorkerStatus({
    enabled: true,
    refetchIntervalMs: 15000,
  });
  
  const [connectionStep, setConnectionStep] = useState<ConnectionStep>("idle");
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Olá! Esta é uma mensagem de teste do sistema Klett Whats Sender. 🧪");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Auto-refresh QR code every 5 seconds when dialog is open and waiting for scan
  useEffect(() => {
    if (isDialogOpen && (session?.status === "QR_REQUIRED" || connectionStep === "waiting_scan")) {
      const interval = setInterval(() => {
        refetch();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isDialogOpen, session?.status, connectionStep, refetch]);

  // Tick for countdown UI while waiting for QR
  useEffect(() => {
    if (!isDialogOpen || connectionStep !== "waiting_scan") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isDialogOpen, connectionStep]);

  const handleConnect = async () => {
    setWorkerError(null);
    setIsDialogOpen(true);
    setConnectionStep("testing");
    
    try {
      toast.info("Testando conexão com o servidor...");
      
      const healthResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-control?action=health`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      
      const healthResult = await healthResponse.json();
      
      if (!healthResult.success) {
        setConnectionStep("test_error");
        setWorkerError(healthResult.error || "Worker não está acessível");
        toast.error("Servidor não está respondendo");
        return;
      }
      
      setConnectionStep("test_success");
      toast.success("Servidor conectado!");
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Evitar gerar QR duplicado / conflito de lock:
      // se já estiver em QR_REQUIRED, apenas abrir o modal e aguardar.
      try {
        const statusResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-control?action=status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        const statusJson = await statusResponse.json();
        if (statusJson?.success && statusJson?.dbStatus === "QR_REQUIRED") {
          const lockExpiresAtMs = statusJson?.lock?.lockExpiresAt
            ? Date.parse(statusJson.lock.lockExpiresAt)
            : null;
          const isLockActive =
            statusJson?.lock?.isLocked &&
            typeof lockExpiresAtMs === "number" &&
            lockExpiresAtMs > Date.now();

          // Se há lock ativo, apenas aguardar; se não, seguimos e tentamos iniciar novamente.
          if (isLockActive) {
            setConnectionStep("waiting_scan");
            toast.info("QR já está em processo. Aguarde aparecer no modal...");
            return;
          }
        }
      } catch {
        // Se falhar o status, seguimos com o fluxo normal
      }
      
      setConnectionStep("generating");
      toast.info("Iniciando conexão WhatsApp...");
      
      const startResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-control?action=start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      
      const startResult = await startResponse.json();
      
      if (startResult.success) {
        setConnectionStep("waiting_scan");
        toast.success("Aguardando QR Code...");
      } else {
        setConnectionStep("test_error");
        setWorkerError(startResult.error || "Erro ao iniciar conexão");
        toast.error(startResult.error || "Erro ao iniciar conexão");
      }
    } catch (error) {
      console.error("Erro ao conectar:", error);
      setConnectionStep("test_error");
      setWorkerError("Erro de rede ao conectar com o servidor");
      toast.error("Erro de conexão");
    }
  };

  const handleDisconnect = async () => {
    try {
      toast.info("Desconectando WhatsApp...");
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-control?action=stop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      
      const result = await response.json();
      
      if (!result.success) {
        console.warn("Worker stop failed, updating DB anyway:", result.error);
      }
      
      await updateSession.mutateAsync({
        status: "DISCONNECTED",
        qr_code: null,
        session_data: null,
      });
      
      await supabase.from("send_logs").insert({
        event: "SESSION_DISCONNECTED",
        details: { disconnected_at: new Date().toISOString(), worker_response: result },
      });
      
      setConnectionStep("idle");
      toast.success("Sessão desconectada");
    } catch (error) {
      console.error("Erro ao desconectar:", error);
      toast.error("Erro ao desconectar");
    }
  };

  const handleCancelConnection = () => {
    setIsDialogOpen(false);
    setConnectionStep("idle");
    handleDisconnect();
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Informe o número do telefone");
      return;
    }

    const phone = testPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      toast.error("Número de telefone inválido");
      return;
    }

    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.from("send_queue").insert({
        phone: phone,
        patient_name: "TESTE",
        cpf: "00000000000",
        protocol: `TEST-${Date.now()}`,
        result_link: "https://teste.com",
        status: "PENDING",
        sequence_num: 0,
        template_id: null,
      }).select().single();

      if (error) throw error;

      await supabase.from("send_logs").insert({
        event: "TEST_MESSAGE_QUEUED",
        queue_id: data.id,
        details: { phone, message: testMessage, queued_at: new Date().toISOString() },
      });

      toast.success("Mensagem de teste adicionada à fila!");
    } catch (error) {
      console.error("Error sending test:", error);
      toast.error("Erro ao enviar mensagem de teste");
    } finally {
      setIsSendingTest(false);
    }
  };

  const statusConfig = {
    CONNECTED: {
      icon: Wifi,
      label: "Conectado",
      description: "WhatsApp está conectado e pronto para enviar mensagens",
      color: "text-success",
      bgColor: "bg-success/10",
    },
    DISCONNECTED: {
      icon: WifiOff,
      label: "Desconectado",
      description: "Clique em 'Conectar' para iniciar",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
    QR_REQUIRED: {
      icon: QrCode,
      label: "Aguardando Scan",
      description: "Escaneie o QR Code no modal aberto",
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  };

  const workerDerivedStatus = deriveStatusFromWorker(workerStatusQuery.data);
  const displayStatus = useEffectiveWhatsAppStatus({
    sessionStatus: session?.status,
    workerStatus: workerStatusQuery.data,
  });

  // Close dialog when connected (usar status efetivo para evitar flicker)
  useEffect(() => {
    if (displayStatus === "CONNECTED") {
      setIsDialogOpen(false);
      setConnectionStep("idle");
    }
  }, [displayStatus]);

  const config = statusConfig[displayStatus];
  const StatusIcon = config.icon;

  return (
    <MainLayout>
      <div className="animate-fade-in max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Conexão WhatsApp</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie a conexão do WhatsApp Business
          </p>
        </div>

        {/* Status Card */}
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="text-lg">Status da Conexão</CardTitle>
            <CardDescription>Estado atual da sessão WhatsApp</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="flex items-center gap-4">
                <div className={cn("p-4 rounded-xl", config.bgColor)}>
                  <StatusIcon className={cn("h-8 w-8", config.color)} />
                </div>
                <div className="flex-1">
                  <p className={cn("text-xl font-semibold", config.color)}>
                    {config.label}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {config.description}
                  </p>

                  {workerStatusQuery.data?.success && workerDerivedStatus === "DISCONNECTED" && (
                    <p className="text-xs text-destructive mt-2">
                      Conexão real indisponível no servidor{workerStatusQuery.data?.realConnection?.error
                        ? `: ${workerStatusQuery.data.realConnection.error}`
                        : "."}{" "}
                      Recomendado reconectar.
                    </p>
                  )}

                  {workerStatusQuery.data?.autoReconnect?.blocked && (
                    <p className="text-xs text-warning mt-2">
                      ⚠️ Reconexão automática bloqueada ({workerStatusQuery.data.autoReconnect.reason}). Clique em "Conectar" para parear novamente.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
               {displayStatus !== "CONNECTED" && (
                <Button
                  onClick={handleConnect}
                  className="flex-1"
                >
                  <Plug className="h-4 w-4 mr-2" />
                  Conectar
                </Button>
              )}
              
               {displayStatus === "CONNECTED" && (
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Desconectar
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  workerStatusQuery.refetch();
                  refetch();
                }}
                className="px-3"
                title="Atualizar status"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Connection Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open && connectionStep !== "idle") {
            handleCancelConnection();
          } else {
            setIsDialogOpen(open);
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Conectar WhatsApp
              </DialogTitle>
              <DialogDescription>
                Escaneie o QR Code com seu celular para conectar
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center py-4">
              {/* Connection Steps */}
              {connectionStep === "testing" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Testando conexão com o servidor...</p>
                </div>
              )}

              {connectionStep === "test_success" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <CheckCircle2 className="h-12 w-12 text-success" />
                  <p className="text-sm text-success">Servidor conectado!</p>
                </div>
              )}

              {connectionStep === "test_error" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <XCircle className="h-12 w-12 text-destructive" />
                  <p className="text-sm text-destructive">{workerError}</p>
                  <Button onClick={handleConnect} variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar novamente
                  </Button>
                </div>
              )}

              {connectionStep === "generating" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                </div>
              )}

              {connectionStep === "waiting_scan" && (
                <>
                  {session?.qr_code ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-white rounded-xl shadow-lg">
                        <img
                          src={session.qr_code}
                          alt="QR Code"
                          className="w-64 h-64"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-8">
                      <RefreshCw className="h-12 w-12 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Aguardando QR Code do servidor...</p>
                      {(() => {
                        const lock = workerStatusQuery.data?.lock;
                        const stats = workerStatusQuery.data?.stats;
                        if (!lock?.isLocked || !lock.lockExpiresAt) return null;

                        const lockExpiresAtMs = Date.parse(lock.lockExpiresAt);
                        const secondsLeft = Math.max(0, Math.ceil((lockExpiresAtMs - nowMs) / 1000));
                        const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
                        const ss = String(secondsLeft % 60).padStart(2, "0");

                        const isLikelyLockConflict =
                          !!lock.lockHolder &&
                          !!stats?.workerId &&
                          lock.lockHolder !== stats.workerId &&
                          workerStatusQuery.data?.realConnection?.error === "Client não inicializado";

                        return (
                          <div className="text-center space-y-1">
                            {isLikelyLockConflict ? (
                              <p className="text-xs text-warning">
                                Há um lock antigo ativo. Deve liberar em ~{mm}:{ss}.
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Inicializando… pode levar até alguns minutos.
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              Dica: evite clicar em “Conectar” repetidas vezes para não gerar conflitos.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleCancelConnection}>
                Cancelar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Test Message Card - Only show when connected */}
        {displayStatus === "CONNECTED" && (
          <Card className="mt-6 border-warning/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-warning" />
                Teste de Envio
              </CardTitle>
              <CardDescription>
                Envie uma mensagem de teste para verificar se o WhatsApp está funcionando
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testPhone">Número do Telefone</Label>
                <Input
                  id="testPhone"
                  placeholder="55 11 99999-9999"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Formato: código país + DDD + número (ex: 5511999999999)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="testMessage">Mensagem de Teste</Label>
                <Textarea
                  id="testMessage"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleSendTest}
                disabled={isSendingTest || !testPhone.trim()}
                className="w-full"
                variant="secondary"
              >
                {isSendingTest ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar Mensagem de Teste
              </Button>

              <p className="text-xs text-success text-center">
                ✅ Mensagens de teste são processadas mesmo com envio desativado
              </p>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Instruções</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  1
                </span>
                <span>Clique em "Conectar" para abrir o QR Code</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  2
                </span>
                <span>Abra o WhatsApp no seu celular</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  3
                </span>
                <span>
                  Vá em Configurações → Aparelhos conectados → Conectar um aparelho
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  4
                </span>
                <span>Aponte a câmera para o QR Code no modal</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
