import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wifi, WifiOff, QrCode, Trash2, Loader2, Send, RefreshCw, Unplug, Smartphone } from "lucide-react";
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

  const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-webhook`;

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
              setConnection(prev => ({
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
          webhookUrl: WEBHOOK_URL,
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
    } catch (err) {
      console.error("Erro ao conectar:", err);
      setStatus("error");
      toast.error("Erro ao conectar WhatsApp");
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
          setConnection(prev => {
            const updated = {
              ...prev!,
              profileName: data.profileName,
              phoneNumber: data.phoneNumber,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
          });
          stopPolling();
          toast.success("WhatsApp conectado com sucesso!");
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
        setConnection(prev => ({
          ...prev!,
          profileName: data.profileName,
          phoneNumber: data.phoneNumber,
        }));
        toast.success("WhatsApp está conectado");
      } else {
        setStatus("disconnected");
        toast.info("WhatsApp está desconectado");
      }
    } catch (err) {
      console.error("Erro ao verificar status:", err);
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
      toast.success("WhatsApp desconectado");
    } catch (err) {
      console.error("Erro ao desconectar:", err);
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
      toast.success("Instância deletada permanentemente");
    } catch (err) {
      console.error("Erro ao deletar:", err);
      toast.error("Erro ao deletar instância");
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
      toast.success("Mensagem enviada com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar:", err);
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const statusConfig = {
    idle: { color: "bg-muted-foreground", label: "Não conectado" },
    loading: { color: "bg-yellow-500 animate-pulse", label: "Conectando..." },
    waiting_qr: { color: "bg-yellow-500 animate-pulse", label: "Gerando QR Code..." },
    qr: { color: "bg-yellow-500 animate-pulse", label: "Aguardando leitura do QR" },
    connected: { color: "bg-primary", label: "Conectado" },
    disconnected: { color: "bg-destructive", label: "Desconectado" },
    error: { color: "bg-destructive", label: "Erro" },
  };

  return (
    <div className="space-y-6">
      {/* Header com status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">WhatsApp</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${statusConfig[status].color}`} />
              <span className="text-xs text-muted-foreground">{statusConfig[status].label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* IDLE */}
      {status === "idle" && (
        <Card className="border-dashed border-border bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <QrCode className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Conecte seu WhatsApp escaneando o QR Code</p>
            <Button onClick={connect} className="gap-2">
              <Wifi className="w-4 h-4" /> Conectar WhatsApp
            </Button>
          </CardContent>
        </Card>
      )}

      {/* LOADING */}
      {status === "loading" && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Criando instância e gerando QR Code...</p>
          </CardContent>
        </Card>
      )}

      {/* WAITING QR */}
      {status === "waiting_qr" && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            <p className="text-xs text-muted-foreground mt-1">Isso pode levar alguns segundos</p>
          </CardContent>
        </Card>
      )}

      {/* QR CODE */}
      {status === "qr" && qrCode && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-sm font-medium text-foreground mb-4">Escaneie o QR Code com seu WhatsApp:</p>
            <img
              src={`data:image/png;base64,${qrCode}`}
              alt="QR Code WhatsApp"
              className="w-64 h-64 rounded-xl border-2 border-border shadow-lg"
            />
            <p className="text-xs text-muted-foreground mt-4 animate-pulse">⏳ Aguardando conexão...</p>
          </CardContent>
        </Card>
      )}

      {/* CONNECTED */}
      {status === "connected" && (
        <div className="space-y-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col items-center py-6">
              <Wifi className="w-8 h-8 text-primary mb-2" />
              <p className="text-lg font-semibold text-foreground">WhatsApp Conectado!</p>
              {connection?.profileName && (
                <p className="text-sm text-muted-foreground mt-1">👤 {connection.profileName}</p>
              )}
              {connection?.phoneNumber && (
                <p className="text-sm text-muted-foreground">📞 {connection.phoneNumber}</p>
              )}
            </CardContent>
          </Card>

          {/* Enviar mensagem de teste */}
          <Card className="border-border">
            <CardContent className="py-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Send className="w-4 h-4" /> Enviar mensagem de teste
              </h3>
              <Input
                placeholder="Número (ex: 5511999999999)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="bg-muted/50 border-border"
              />
              <Textarea
                placeholder="Mensagem..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="bg-muted/50 border-border resize-none"
                rows={2}
              />
              <Button
                onClick={sendTestMessage}
                disabled={sending || !testPhone}
                className="w-full gap-2"
                variant="default"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Enviando..." : "Enviar Mensagem"}
              </Button>
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={checkStatus}>
              <RefreshCw className="w-3.5 h-3.5" /> Verificar Status
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-orange-500 border-orange-500/30 hover:bg-orange-500/10" onClick={disconnect}>
              <Unplug className="w-3.5 h-3.5" /> Desconectar
            </Button>
          </div>
          <Button variant="outline" size="sm" className="w-full gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={deleteInstance}>
            <Trash2 className="w-3.5 h-3.5" /> Deletar Instância (irreversível)
          </Button>
        </div>
      )}

      {/* DISCONNECTED */}
      {status === "disconnected" && (
        <div className="space-y-4">
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="flex flex-col items-center py-6">
              <WifiOff className="w-8 h-8 text-orange-500 mb-2" />
              <p className="text-sm font-medium text-foreground">WhatsApp desconectado</p>
              <p className="text-xs text-muted-foreground mt-1">A instância ainda existe. Você pode reconectar ou deletar.</p>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" onClick={connect}>
              <RefreshCw className="w-4 h-4" /> Reconectar
            </Button>
            <Button variant="outline" className="flex-1 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={deleteInstance}>
              <Trash2 className="w-4 h-4" /> Deletar
            </Button>
          </div>
        </div>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div className="space-y-4">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex flex-col items-center py-6">
              <WifiOff className="w-8 h-8 text-destructive mb-2" />
              <p className="text-sm font-medium text-foreground">Erro ao conectar</p>
              <p className="text-xs text-muted-foreground mt-1">Verifique sua conexão e tente novamente</p>
            </CardContent>
          </Card>
          <Button onClick={connect} className="w-full gap-2">
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
};

export default WhatsAppManager;
