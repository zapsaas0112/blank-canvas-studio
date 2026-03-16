import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wifi, WifiOff, Trash2, RefreshCw, Send, Smartphone, QrCode } from "lucide-react";
import { toast } from "sonner";

type Status = "idle" | "loading" | "waiting_qr" | "qr" | "connected" | "disconnected" | "error";

interface ConnectionData {
  token: string;
  instanceId: string;
  profileName?: string;
  phoneNumber?: string;
}

const STORAGE_KEY = "whatsapp_connection";

const WhatsAppManager = ({ userName }: { userName: string }) => {
  const [status, setStatus] = useState<Status>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionData | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Olá! Esta é uma mensagem de teste. 🚀");
  const [sending, setSending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ConnectionData;
        setConnection(parsed);
        (async () => {
          try {
            const { data } = await supabase.functions.invoke("whatsapp-status", {
              body: { token: parsed.token },
            });
            if (data?.connected) {
              setStatus("connected");
              setConnection((prev) => ({
                ...prev!,
                profileName: data.profileName,
                phoneNumber: data.phoneNumber,
              }));
            } else {
              setStatus("disconnected");
            }
          } catch {
            localStorage.removeItem(STORAGE_KEY);
            setConnection(null);
            setStatus("idle");
          }
        })();
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    return () => stopPolling();
  }, []);

  const saveConnection = (data: ConnectionData) => {
    setConnection(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const clearConnection = () => {
    setConnection(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const connect = async () => {
    setStatus("loading");
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedData = saved ? JSON.parse(saved) : null;

      const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
        body: {
          userName,
          webhookUrl,
          token: savedData?.token || undefined,
          instanceId: savedData?.instanceId || undefined,
        },
      });
      if (error) throw error;

      if (data.status === "connected") {
        saveConnection({ token: data.token, instanceId: data.instanceId });
        setStatus("connected");
      } else if (data.qrCode) {
        setQrCode(data.qrCode);
        saveConnection({ token: data.token, instanceId: data.instanceId });
        setStatus("qr");
        startPolling(data.token);
      } else {
        saveConnection({ token: data.token, instanceId: data.instanceId });
        setStatus("waiting_qr");
        startPolling(data.token);
      }
    } catch (err: any) {
      console.error("Erro ao conectar:", err);
      toast.error(err?.message || "Erro ao conectar");
      setStatus("error");
    }
  };

  const startPolling = (instanceToken: string) => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("whatsapp-status", {
          body: { token: instanceToken },
        });

        if (data?.connected) {
          setStatus("connected");
          setConnection((prev) => {
            const updated = {
              ...prev!,
              profileName: data.profileName,
              phoneNumber: data.phoneNumber,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
          });
          stopPolling();
          toast.success("WhatsApp conectado!");
        } else if (data?.qrCode) {
          setQrCode(data.qrCode);
          setStatus("qr");
        }
      } catch (err) {
        console.error("Erro no polling:", err);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const checkStatus = async () => {
    if (!connection?.token) return;
    try {
      const { data } = await supabase.functions.invoke("whatsapp-status", {
        body: { token: connection.token },
      });
      if (data?.connected) {
        setStatus("connected");
        setConnection((prev) => ({
          ...prev!,
          profileName: data.profileName,
          phoneNumber: data.phoneNumber,
        }));
        toast.success("Conectado");
      } else {
        setStatus("disconnected");
        toast.info("Desconectado");
      }
    } catch {
      toast.error("Erro ao verificar status");
    }
  };

  const disconnect = async () => {
    if (!connection?.token) return;
    try {
      await supabase.functions.invoke("whatsapp-disconnect", {
        body: { token: connection.token },
      });
      setStatus("disconnected");
      setQrCode(null);
      stopPolling();
      toast.success("Desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    }
  };

  const deleteInstance = async () => {
    if (!connection?.instanceId) return;
    if (!confirm("Tem certeza? Esta ação é irreversível!")) return;
    try {
      await supabase.functions.invoke("whatsapp-delete", {
        body: { instanceId: connection.instanceId },
      });
      setStatus("idle");
      clearConnection();
      setQrCode(null);
      stopPolling();
      toast.success("Instância deletada");
    } catch {
      toast.error("Erro ao deletar");
    }
  };

  const sendTestMessage = async () => {
    if (!connection?.token || !testPhone || !testMessage) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          token: connection.token,
          phone: testPhone.replace(/\D/g, ""),
          message: testMessage,
        },
      });
      if (error) throw error;
      toast.success("Mensagem enviada!");
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const statusConfig: Record<Status, { color: string; label: string; icon: React.ReactNode }> = {
    idle: { color: "bg-muted text-muted-foreground", label: "Não conectado", icon: <WifiOff className="w-3 h-3" /> },
    loading: { color: "bg-yellow-500/20 text-yellow-600", label: "Conectando...", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    waiting_qr: { color: "bg-yellow-500/20 text-yellow-600", label: "Gerando QR...", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    qr: { color: "bg-yellow-500/20 text-yellow-600", label: "Aguardando QR", icon: <QrCode className="w-3 h-3" /> },
    connected: { color: "bg-primary/20 text-primary", label: "Conectado", icon: <Wifi className="w-3 h-3" /> },
    disconnected: { color: "bg-destructive/20 text-destructive", label: "Desconectado", icon: <WifiOff className="w-3 h-3" /> },
    error: { color: "bg-destructive/20 text-destructive", label: "Erro", icon: <WifiOff className="w-3 h-3" /> },
  };

  const sc = statusConfig[status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">WhatsApp</h2>
          <p className="text-sm text-muted-foreground">Gerencie sua conexão</p>
        </div>
        <Badge variant="outline" className={`${sc.color} gap-1`}>
          {sc.icon} {sc.label}
        </Badge>
      </div>

      {/* IDLE */}
      {status === "idle" && (
        <Card className="border-border">
          <CardContent className="p-8 text-center space-y-4">
            <Smartphone className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhuma instância conectada</p>
            <Button onClick={connect} className="gap-2">
              <Smartphone className="w-4 h-4" /> Conectar WhatsApp
            </Button>
          </CardContent>
        </Card>
      )}

      {/* LOADING / WAITING QR */}
      {(status === "loading" || status === "waiting_qr") && (
        <Card className="border-border">
          <CardContent className="p-8 text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              {status === "loading" ? "Criando instância e gerando QR Code..." : "Gerando QR Code..."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* QR CODE */}
      {status === "qr" && qrCode && (
        <Card className="border-border">
          <CardContent className="p-6 text-center space-y-4">
            <p className="text-sm font-medium text-foreground">Escaneie o QR Code com seu WhatsApp:</p>
            <img
              src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR Code WhatsApp"
              className="w-56 h-56 mx-auto rounded-xl border-2 border-border shadow-lg"
            />
            <p className="text-xs text-muted-foreground animate-pulse">⏳ Aguardando conexão...</p>
          </CardContent>
        </Card>
      )}

      {/* CONNECTED */}
      {status === "connected" && (
        <div className="space-y-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5 text-center space-y-2">
              <div className="text-3xl">✅</div>
              <p className="text-lg font-semibold text-primary">WhatsApp Conectado!</p>
              {connection?.profileName && (
                <p className="text-sm text-muted-foreground">👤 {connection.profileName}</p>
              )}
              {connection?.phoneNumber && (
                <p className="text-sm text-muted-foreground">📞 {connection.phoneNumber}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm text-foreground">📤 Enviar mensagem de teste</h3>
              <Input
                placeholder="Número (ex: 5511999999999)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              <Textarea
                placeholder="Mensagem..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={2}
              />
              <Button onClick={sendTestMessage} disabled={sending || !testPhone} className="w-full gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Enviando..." : "Enviar Mensagem"}
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={checkStatus}>
              <RefreshCw className="w-3.5 h-3.5" /> Verificar Status
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={disconnect}>
              <WifiOff className="w-3.5 h-3.5" /> Desconectar
            </Button>
          </div>
          <Button variant="outline" size="sm" className="w-full gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={deleteInstance}>
            <Trash2 className="w-3.5 h-3.5" /> Deletar Instância (irreversível)
          </Button>
        </div>
      )}

      {/* DISCONNECTED */}
      {status === "disconnected" && (
        <div className="space-y-3">
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="p-5 text-center space-y-1">
              <p className="text-orange-700 dark:text-orange-400 font-medium">WhatsApp desconectado</p>
              <p className="text-xs text-orange-500">A instância ainda existe. Você pode reconectar ou deletar.</p>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button className="flex-1 gap-1" onClick={connect}>
              <RefreshCw className="w-3.5 h-3.5" /> Reconectar
            </Button>
            <Button variant="outline" className="flex-1 gap-1 text-destructive border-destructive/30" onClick={deleteInstance}>
              <Trash2 className="w-3.5 h-3.5" /> Deletar
            </Button>
          </div>
        </div>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div className="space-y-3">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-5 text-center space-y-1">
              <p className="text-destructive font-medium">❌ Erro ao conectar</p>
              <p className="text-xs text-muted-foreground">Verifique sua conexão e tente novamente</p>
            </CardContent>
          </Card>
          <Button onClick={connect} className="w-full">Tentar novamente</Button>
        </div>
      )}
    </div>
  );
};

export default WhatsAppManager;
