import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import * as whatsappService from "@/services/whatsappService";
import { normalizeWhatsAppNumber, isValidWhatsAppNumber } from "@/lib/whatsapp-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wifi, WifiOff, Trash2, RefreshCw, Send, Smartphone, QrCode, Bug, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Status = "idle" | "loading" | "waiting_qr" | "qr" | "connected" | "disconnected" | "error";

interface ConnectionData {
  token: string;
  instanceId: string;
  profileName?: string;
  phoneNumber?: string;
}

interface DiagnosticData {
  rawStatus?: string;
  webhook?: any;
  lastSendDebug?: any;
  lastError?: string;
}

const STORAGE_KEY = "whatsapp_connection";
const WEBHOOK_URL = `https://ybwcqdquousomymrjssn.supabase.co/functions/v1/whatsapp-webhook`;

const WhatsAppManager = ({ userName }: { userName: string }) => {
  const { workspace } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionData | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Olá! Esta é uma mensagem de teste do ZapDesk. 🚀");
  const [sending, setSending] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [diag, setDiag] = useState<DiagnosticData>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ──── Load from Supabase first, localStorage as fallback ────
  useEffect(() => {
    (async () => {
      // Try Supabase first
      if (workspace) {
        const { data: inst } = await supabase
          .from("instances")
          .select("*")
          .eq("workspace_id", workspace.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (inst?.token) {
          const conn: ConnectionData = {
            token: inst.token,
            instanceId: inst.instance_id_external || inst.id,
            profileName: inst.name || undefined,
            phoneNumber: inst.phone_number || undefined,
          };
          setConnection(conn);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));

          // Check live status
          try {
            const statusData = await whatsappService.getInstanceStatus(inst.token);
            setDiag((prev) => ({ ...prev, rawStatus: statusData.rawStatus, webhook: statusData.webhook }));

            if (statusData.connected) {
              setStatus("connected");
              const updated = { ...conn, profileName: statusData.profileName || conn.profileName, phoneNumber: statusData.phoneNumber || conn.phoneNumber };
              setConnection(updated);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              // Sync to DB
              if (workspace) {
                await whatsappService.persistInstance(workspace.id, {
                  token: conn.token, instanceId: conn.instanceId,
                  status: "connected", phoneNumber: statusData.phoneNumber, profileName: statusData.profileName,
                });
              }
            } else {
              setStatus("disconnected");
            }
          } catch {
            setStatus("disconnected");
          }
          return;
        }
      }

      // Fallback: localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as ConnectionData;
          setConnection(parsed);
          const statusData = await whatsappService.getInstanceStatus(parsed.token);
          setDiag((prev) => ({ ...prev, rawStatus: statusData.rawStatus, webhook: statusData.webhook }));
          if (statusData.connected) {
            setStatus("connected");
            setConnection((prev) => ({ ...prev!, profileName: statusData.profileName || prev?.profileName, phoneNumber: statusData.phoneNumber || prev?.phoneNumber }));
          } else {
            setStatus("disconnected");
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
          setConnection(null);
          setStatus("idle");
        }
      }
    })();
    return () => stopPolling();
  }, [workspace?.id]);

  const saveConnection = useCallback(async (data: ConnectionData) => {
    setConnection(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (workspace) {
      try {
        await whatsappService.persistInstance(workspace.id, {
          token: data.token, instanceId: data.instanceId,
          status: "disconnected", phoneNumber: data.phoneNumber, profileName: data.profileName,
        });
      } catch (e) { console.error("Persist error:", e); }
    }
  }, [workspace?.id]);

  const clearConnection = useCallback(async () => {
    setConnection(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ──── Connect ────
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
      if (data?.error) throw new Error(data.error);

      const conn: ConnectionData = { token: data.token, instanceId: data.instanceId };

      if (data.status === "connected") {
        conn.phoneNumber = data.phoneNumber;
        conn.profileName = data.profileName;
        await saveConnection(conn);
        if (workspace) {
          await whatsappService.persistInstance(workspace.id, { ...conn, status: "connected" });
        }
        setStatus("connected");
        toast.success("WhatsApp conectado!");
      } else if (data.qrCode) {
        setQrCode(data.qrCode);
        await saveConnection(conn);
        setStatus("qr");
        startPolling(data.token, conn);
      } else {
        await saveConnection(conn);
        setStatus("waiting_qr");
        startPolling(data.token, conn);
      }

      if (data.debug) setDiag((prev) => ({ ...prev, lastSendDebug: data.debug }));
    } catch (err: any) {
      console.error("Erro ao conectar:", err);
      toast.error(err?.message || "Erro ao conectar");
      setDiag((prev) => ({ ...prev, lastError: err?.message }));
      setStatus("error");
    }
  };

  // ──── Polling ────
  const startPolling = (instanceToken: string, conn: ConnectionData) => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const statusData = await whatsappService.getInstanceStatus(instanceToken);
        setDiag((prev) => ({ ...prev, rawStatus: statusData.rawStatus, webhook: statusData.webhook }));

        if (statusData.connected) {
          const updated = { ...conn, profileName: statusData.profileName || conn.profileName, phoneNumber: statusData.phoneNumber || conn.phoneNumber };
          setConnection(updated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          if (workspace) {
            await whatsappService.persistInstance(workspace.id, { ...updated, status: "connected" });
          }
          setStatus("connected");
          stopPolling();
          toast.success("WhatsApp conectado!");
        } else if (statusData.qrCode) {
          setQrCode(statusData.qrCode);
          setStatus("qr");
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  // ──── Check Status ────
  const checkStatus = async () => {
    if (!connection?.token) return;
    try {
      const statusData = await whatsappService.getInstanceStatus(connection.token);
      setDiag((prev) => ({ ...prev, rawStatus: statusData.rawStatus, webhook: statusData.webhook }));
      if (statusData.connected) {
        setStatus("connected");
        const updated = { ...connection, profileName: statusData.profileName || connection.profileName, phoneNumber: statusData.phoneNumber || connection.phoneNumber };
        setConnection(updated);
        if (workspace) await whatsappService.persistInstance(workspace.id, { ...updated, status: "connected" });
        toast.success("Conectado");
      } else {
        setStatus("disconnected");
        if (workspace) await whatsappService.persistInstance(workspace.id, { token: connection.token, instanceId: connection.instanceId, status: "disconnected" });
        toast.info("Desconectado");
      }
    } catch (err: any) {
      setDiag((prev) => ({ ...prev, lastError: err?.message }));
      toast.error("Erro ao verificar status");
    }
  };

  // ──── Disconnect ────
  const disconnect = async () => {
    if (!connection?.token) return;
    try {
      await supabase.functions.invoke("whatsapp-disconnect", { body: { token: connection.token } });
      setStatus("disconnected");
      setQrCode(null);
      stopPolling();
      if (workspace) await whatsappService.persistInstance(workspace.id, { token: connection.token, instanceId: connection.instanceId, status: "disconnected" });
      toast.success("Desconectado");
    } catch { toast.error("Erro ao desconectar"); }
  };

  // ──── Delete ────
  const deleteInstance = async () => {
    if (!connection?.instanceId) return;
    if (!confirm("Tem certeza? Esta ação é irreversível!")) return;
    try {
      await supabase.functions.invoke("whatsapp-delete", { body: { instanceId: connection.instanceId } });
      // Remove from DB
      if (connection.token) {
        await supabase.from("instances").delete().eq("token", connection.token);
      }
      setStatus("idle");
      await clearConnection();
      setQrCode(null);
      stopPolling();
      setDiag({});
      toast.success("Instância deletada");
    } catch { toast.error("Erro ao deletar"); }
  };

  // ──── Send Test ────
  const sendTestMessage = async () => {
    if (!connection?.token || !testPhone || !testMessage) return;
    setSending(true);
    setDiag((prev) => ({ ...prev, lastError: undefined, lastSendDebug: undefined }));
    try {
      const normalized = normalizeWhatsAppNumber(testPhone);
      if (!isValidWhatsAppNumber(normalized)) {
        throw new Error(`Número inválido: ${testPhone} → ${normalized}`);
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: { token: connection.token, phone: normalized, message: testMessage, checkNumber: true },
      });

      if (error) throw error;

      setDiag((prev) => ({ ...prev, lastSendDebug: data }));

      if (data?.success) {
        toast.success(`Mensagem enviada! ID: ${data.messageId || "OK"}`);
      } else {
        throw new Error(data?.error || "Envio falhou sem mensagem de erro");
      }
    } catch (err: any) {
      setDiag((prev) => ({ ...prev, lastError: err?.message }));
      toast.error(err?.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  // ──── Status Badge ────
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
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowDiag(!showDiag)} title="Diagnóstico">
            <Bug className="w-4 h-4" />
          </Button>
          <Badge variant="outline" className={`${sc.color} gap-1`}>{sc.icon} {sc.label}</Badge>
        </div>
      </div>

      {/* ──── IDLE ──── */}
      {status === "idle" && (
        <Card className="border-border">
          <CardContent className="p-8 text-center space-y-4">
            <Smartphone className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhuma instância conectada</p>
            <Button onClick={connect} className="gap-2"><Smartphone className="w-4 h-4" /> Conectar WhatsApp</Button>
          </CardContent>
        </Card>
      )}

      {/* ──── LOADING / WAITING QR ──── */}
      {(status === "loading" || status === "waiting_qr") && (
        <Card className="border-border">
          <CardContent className="p-8 text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">{status === "loading" ? "Criando instância..." : "Gerando QR Code..."}</p>
          </CardContent>
        </Card>
      )}

      {/* ──── QR CODE ──── */}
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

      {/* ──── CONNECTED ──── */}
      {status === "connected" && (
        <div className="space-y-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
              <p className="text-lg font-semibold text-primary">WhatsApp Conectado!</p>
              {connection?.profileName && <p className="text-sm text-muted-foreground">👤 {connection.profileName}</p>}
              {connection?.phoneNumber && <p className="text-sm text-muted-foreground">📞 {connection.phoneNumber}</p>}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2"><Send className="w-4 h-4" /> Enviar mensagem de teste</h3>
              <Input
                placeholder="Número (ex: 5511999999999)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              {testPhone && !isValidWhatsAppNumber(normalizeWhatsAppNumber(testPhone)) && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Número inválido: {normalizeWhatsAppNumber(testPhone)}</p>
              )}
              <Textarea placeholder="Mensagem..." value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={2} />
              <Button onClick={sendTestMessage} disabled={sending || !testPhone || !isValidWhatsAppNumber(normalizeWhatsAppNumber(testPhone))} className="w-full gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Enviando..." : "Enviar Mensagem"}
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={checkStatus}><RefreshCw className="w-3.5 h-3.5" /> Verificar Status</Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={disconnect}><WifiOff className="w-3.5 h-3.5" /> Desconectar</Button>
          </div>
          <Button variant="outline" size="sm" className="w-full gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={deleteInstance}><Trash2 className="w-3.5 h-3.5" /> Deletar Instância</Button>
        </div>
      )}

      {/* ──── DISCONNECTED ──── */}
      {status === "disconnected" && (
        <div className="space-y-3">
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="p-5 text-center space-y-1">
              <p className="text-orange-700 dark:text-orange-400 font-medium">WhatsApp desconectado</p>
              <p className="text-xs text-orange-500">A instância existe. Reconecte ou delete.</p>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button className="flex-1 gap-1" onClick={connect}><RefreshCw className="w-3.5 h-3.5" /> Reconectar</Button>
            <Button variant="outline" className="flex-1 gap-1 text-destructive border-destructive/30" onClick={deleteInstance}><Trash2 className="w-3.5 h-3.5" /> Deletar</Button>
          </div>
        </div>
      )}

      {/* ──── ERROR ──── */}
      {status === "error" && (
        <div className="space-y-3">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-5 text-center space-y-1">
              <XCircle className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-destructive font-medium">Erro ao conectar</p>
              {diag.lastError && <p className="text-xs text-muted-foreground">{diag.lastError}</p>}
            </CardContent>
          </Card>
          <Button onClick={connect} className="w-full">Tentar novamente</Button>
        </div>
      )}

      {/* ──── DIAGNOSTIC PANEL ──── */}
      {showDiag && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Bug className="w-4 h-4" /> Painel de Diagnóstico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Instance ID:</span><p className="text-foreground font-mono break-all">{connection?.instanceId || "—"}</p></div>
              <div><span className="text-muted-foreground">Token:</span><p className="text-foreground font-mono break-all">{connection?.token ? `${connection.token.substring(0, 8)}...${connection.token.slice(-4)}` : "—"}</p></div>
              <div><span className="text-muted-foreground">Status:</span><p className="text-foreground">{status}</p></div>
              <div><span className="text-muted-foreground">Phone:</span><p className="text-foreground">{connection?.phoneNumber || "—"}</p></div>
              <div><span className="text-muted-foreground">Profile:</span><p className="text-foreground">{connection?.profileName || "—"}</p></div>
              <div><span className="text-muted-foreground">Webhook URL:</span><p className="text-foreground font-mono break-all text-[10px]">{WEBHOOK_URL}</p></div>
            </div>

            {diag.webhook && (
              <div>
                <span className="text-muted-foreground">Webhook Config:</span>
                <pre className="bg-muted/50 p-2 rounded text-[10px] mt-1 overflow-x-auto max-h-20">{JSON.stringify(diag.webhook, null, 2)}</pre>
              </div>
            )}

            {diag.rawStatus && (
              <div>
                <span className="text-muted-foreground">Raw Status Response:</span>
                <pre className="bg-muted/50 p-2 rounded text-[10px] mt-1 overflow-x-auto max-h-20">{diag.rawStatus}</pre>
              </div>
            )}

            {diag.lastSendDebug && (
              <div>
                <span className="text-muted-foreground">Último envio:</span>
                <pre className="bg-muted/50 p-2 rounded text-[10px] mt-1 overflow-x-auto max-h-24">{JSON.stringify(diag.lastSendDebug, null, 2)}</pre>
              </div>
            )}

            {diag.lastError && (
              <div>
                <span className="text-destructive">Último erro:</span>
                <p className="text-destructive bg-destructive/5 p-2 rounded mt-1">{diag.lastError}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WhatsAppManager;
